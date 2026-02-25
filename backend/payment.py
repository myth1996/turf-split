import httpx
from .settings import settings

BASE = (
    "https://api.cashfree.com/pg"
    if settings.cashfree_env == "production"
    else "https://sandbox.cashfree.com/pg"
)

HEADERS = {
    "x-client-id": settings.cashfree_app_id,
    "x-client-secret": settings.cashfree_secret,
    "x-api-version": "2023-08-01",
    "Content-Type": "application/json",
}


async def create_order(order_id: str, amount: int, customer_name: str, customer_phone: str):
    payload = {
        "order_id": order_id,
        "order_amount": amount,
        "order_currency": "INR",
        "customer_details": {
            "customer_id": order_id,
            "customer_name": customer_name,
            "customer_phone": customer_phone or "9999999999",
        },
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BASE}/orders", json=payload, headers=HEADERS)
        r.raise_for_status()
        return r.json()


async def verify_order(order_id: str):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/orders/{order_id}", headers=HEADERS)
        r.raise_for_status()
        return r.json()
