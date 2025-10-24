import { test, expect } from "@playwright/test";
import Stripe from "stripe";

const whsec = process.env.STRIPE_WEBHOOK_SECRET || "whsec_testsecret";

function signedHeaders(payload: any) {
  const stripe = new Stripe("sk_test_dummy", { apiVersion: "2023-10-16" });
  const body = JSON.stringify(payload);
  const sig = stripe.webhooks.generateTestHeaderString({ payload: body, secret: whsec });
  return { body, sig };
}

test.describe("Stripe webhook", () => {
  test("processes first event and is idempotent on repeat", async ({ request }) => {
    const evt = {
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", client_reference_id: "user_abc123", customer: "cus_test_123", mode: "subscription", subscription: "sub_test_123" } },
    };
    const { body, sig } = signedHeaders(evt);

    // first POST -> 200 ok
    const res1 = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      data: body,
    } as any);
    expect(res1.ok()).toBeTruthy();

    // second POST same id -> 200 no-op
    const res2 = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      data: body,
    } as any);
    expect(res2.ok()).toBeTruthy();
  });

  test("bad signature returns 400", async ({ request }) => {
    const evt = { id: "evt_test_bad", type: "invoice.payment_succeeded", data: { object: { id: "in_test_123", customer: "cus_bad" } } };
    const { body } = signedHeaders(evt);
    const res = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": "t=0,v1=badsig", "content-type": "application/json" },
      data: body,
    } as any);
    expect(res.status()).toBe(400);
  });
});
