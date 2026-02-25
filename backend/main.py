import uuid
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from database import engine, get_db
from models import Base, Session as SessionModel, RSVP
from settings import settings
import payment

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Turf Split API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth ──────────────────────────────────────────────────────────────────────

def verify_admin(x_admin_password: Optional[str] = Header(None)):
    if x_admin_password != settings.admin_password:
        raise HTTPException(status_code=403, detail="Unauthorized")


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateSessionReq(BaseModel):
    date: str
    time: str = "06:00"
    turf_name: str = "Home Turf"
    turf_cost: int = 3200


class RSVPReq(BaseModel):
    player_name: str
    phone: Optional[str] = None
    rsvp_status: str = "in"


class PayCreateReq(BaseModel):
    rsvp_id: int


class PayVerifyReq(BaseModel):
    order_id: str
    rsvp_id: int


# ── Serializers ───────────────────────────────────────────────────────────────

def rsvp_dict(r: RSVP):
    return {
        "id": r.id,
        "player_name": r.player_name,
        "phone": r.phone,
        "rsvp_status": r.rsvp_status,
        "payment_status": r.payment_status,
        "amount_due": r.amount_due,
    }


def session_dict(s: SessionModel):
    confirmed = [r for r in s.rsvps if r.rsvp_status == "in"]
    maybe = [r for r in s.rsvps if r.rsvp_status == "maybe"]
    per_head = s.per_head_cost or (
        -(-s.turf_cost // len(confirmed)) if confirmed else s.turf_cost
    )
    collected = sum(
        (r.amount_due or 0) for r in s.rsvps
        if r.payment_status in ("paid_online", "paid_cash")
    )
    return {
        "id": s.id,
        "date": s.date,
        "time": s.time,
        "turf_name": s.turf_name,
        "turf_cost": s.turf_cost,
        "status": s.status,
        "per_head_cost": per_head,
        "confirmed_count": len(confirmed),
        "maybe_count": len(maybe),
        "collected": collected,
        "rsvps": [rsvp_dict(r) for r in s.rsvps],
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/sessions/current")
def get_current(db: DBSession = Depends(get_db)):
    s = (
        db.query(SessionModel)
        .filter(SessionModel.status.in_(["open", "locked"]))
        .order_by(SessionModel.created_at.desc())
        .first()
    )
    return {"session": session_dict(s) if s else None}


@app.get("/sessions/{session_id}")
def get_session(session_id: str, db: DBSession = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(404, "Session not found")
    return session_dict(s)


@app.post("/sessions")
def create_session(
    req: CreateSessionReq,
    db: DBSession = Depends(get_db),
    _=Depends(verify_admin),
):
    s = SessionModel(
        id=uuid.uuid4().hex[:8],
        date=req.date,
        time=req.time,
        turf_name=req.turf_name,
        turf_cost=req.turf_cost,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return session_dict(s)


@app.post("/sessions/{session_id}/lock")
def lock_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    _=Depends(verify_admin),
):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(404)
    confirmed = [r for r in s.rsvps if r.rsvp_status == "in"]
    if not confirmed:
        raise HTTPException(400, "No confirmed players to split cost")
    per_head = -(-s.turf_cost // len(confirmed))  # ceiling division
    s.per_head_cost = per_head
    s.status = "locked"
    for r in confirmed:
        r.amount_due = per_head
    db.commit()
    db.refresh(s)
    return session_dict(s)


@app.post("/sessions/{session_id}/rsvp")
def add_rsvp(session_id: str, req: RSVPReq, db: DBSession = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(404)
    if s.status == "closed":
        raise HTTPException(400, "Session is closed")
    # Update if same name already joined
    existing = (
        db.query(RSVP)
        .filter(RSVP.session_id == session_id, RSVP.player_name == req.player_name)
        .first()
    )
    if existing:
        existing.rsvp_status = req.rsvp_status
        if req.phone:
            existing.phone = req.phone
        db.commit()
        db.refresh(existing)
        return rsvp_dict(existing)
    r = RSVP(
        session_id=session_id,
        player_name=req.player_name,
        phone=req.phone,
        rsvp_status=req.rsvp_status,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return rsvp_dict(r)


@app.post("/sessions/{session_id}/pay/create")
async def create_payment(
    session_id: str,
    req: PayCreateReq,
    db: DBSession = Depends(get_db),
):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s or s.status == "open":
        raise HTTPException(400, "Session not locked yet")
    r = db.query(RSVP).filter(RSVP.id == req.rsvp_id).first()
    if not r:
        raise HTTPException(404)
    if r.payment_status != "pending":
        raise HTTPException(400, "Already paid")
    order_id = f"turf_{session_id}_{r.id}_{uuid.uuid4().hex[:6]}"
    order = await payment.create_order(
        order_id=order_id,
        amount=r.amount_due or s.per_head_cost,
        customer_name=r.player_name,
        customer_phone=r.phone or "9999999999",
    )
    r.cashfree_order_id = order_id
    db.commit()
    return {"payment_session_id": order["payment_session_id"], "order_id": order_id}


@app.post("/sessions/{session_id}/pay/verify")
async def verify_payment(
    session_id: str,
    req: PayVerifyReq,
    db: DBSession = Depends(get_db),
):
    order = await payment.verify_order(req.order_id)
    if order.get("order_status") == "PAID":
        r = db.query(RSVP).filter(RSVP.id == req.rsvp_id).first()
        if r:
            r.payment_status = "paid_online"
            db.commit()
        return {"success": True}
    return {"success": False}


@app.patch("/sessions/{session_id}/rsvps/{rsvp_id}/cash")
def mark_cash(
    session_id: str,
    rsvp_id: int,
    db: DBSession = Depends(get_db),
    _=Depends(verify_admin),
):
    r = db.query(RSVP).filter(RSVP.id == rsvp_id).first()
    if not r:
        raise HTTPException(404)
    r.payment_status = "paid_cash"
    db.commit()
    return rsvp_dict(r)


@app.delete("/sessions/{session_id}/rsvps/{rsvp_id}")
def remove_rsvp(
    session_id: str,
    rsvp_id: int,
    db: DBSession = Depends(get_db),
    _=Depends(verify_admin),
):
    r = db.query(RSVP).filter(RSVP.id == rsvp_id).first()
    if not r:
        raise HTTPException(404)
    db.delete(r)
    db.commit()
    return {"ok": True}


@app.post("/sessions/{session_id}/close")
def close_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    _=Depends(verify_admin),
):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(404)
    s.status = "closed"
    db.commit()
    return {"ok": True}
