from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from database import Base


def gen_id():
    return uuid.uuid4().hex[:8]


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=gen_id)
    date = Column(String, nullable=False)        # "2025-03-15"
    time = Column(String, default="06:00")        # "06:00"
    turf_name = Column(String, default="Home Turf")
    turf_cost = Column(Integer, default=3200)
    status = Column(String, default="open")       # open / locked / closed
    per_head_cost = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    rsvps = relationship("RSVP", back_populates="session", cascade="all, delete")


class RSVP(Base):
    __tablename__ = "rsvps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    player_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    rsvp_status = Column(String, default="in")            # in / maybe / out
    payment_status = Column(String, default="pending")    # pending / paid_online / paid_cash
    amount_due = Column(Integer, nullable=True)
    cashfree_order_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="rsvps")
