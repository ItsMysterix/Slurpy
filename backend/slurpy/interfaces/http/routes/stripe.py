from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import os, stripe

router = APIRouter(prefix="/stripe", tags=["stripe"])
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

class CheckoutBody(BaseModel):
    price_id: str | None = None
    mode: str = "subscription"
    customer_email: str | None = None

@router.post("/checkout")
async def create_checkout(body: CheckoutBody):
    try:
        price_id = body.price_id or os.getenv("STRIPE_PRICE_ID_MONTHLY")
        if not price_id:
            raise ValueError("Missing price_id")
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000")

        session = stripe.checkout.Session.create(
            mode=body.mode,
            line_items=[{"price": price_id, "quantity": 1}],
            customer_email=body.customer_email,
            success_url=f"{app_url}/?status=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{app_url}/?status=cancel",
            allow_promotion_codes=True,
            currency="usd",
            automatic_tax={"enabled": True},
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/webhook")
async def webhook(req: Request):
    payload = await req.body()
    sig = req.headers.get("stripe-signature")
    secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    try:
        event = stripe.Webhook.construct_event(payload, sig, secret)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")

    t = event["type"]
    obj = event["data"]["object"]

    if t == "checkout.session.completed":
        # TODO: mark user Pro
        pass
    elif t in ("invoice.paid", "customer.subscription.updated"):
        pass
    elif t == "invoice.payment_failed":
        pass

    return {"ok": True}
