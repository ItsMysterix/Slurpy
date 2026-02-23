export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { z } from "@/lib/validate";
import { guardRate } from "@/lib/guards";
import { withCORS } from "@/lib/cors";
import { assertSameOrigin, assertDoubleSubmit } from "@/lib/csrf";
import { isE2EBypassEnabled } from "@/lib/runtime-safety";

function getOrigin(req: NextRequest) {
  const url = new URL(req.url);
  // In prod behind proxies you may want to respect X-Forwarded-Proto
  return `${url.protocol}//${url.host}`;
}

export const POST = withCORS(withAuth(async function POST(req: NextRequest, auth) {
  const userId = auth.userId;

  // Rate limit: 10/min/user
  {
    const limited = await guardRate(req, { key: "stripe-create-session", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
  }

  // CSRF
  {
    const r = await assertSameOrigin(req);
    if (r) return r;
    const r2 = assertDoubleSubmit(req);
    if (r2) return r2;
  }

  // Parse
  const Input = z.object({ price_id: z.string().min(1) }).strip();
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { price_id } = parsed.data;

  // E2E stub path to avoid network in tests
  if (isE2EBypassEnabled() && req.headers.get("x-e2e-stripe-stub") === "1") {
    return NextResponse.json({ id: "cs_test_123", url: "https://stripe.test/session/cs_test_123" });
  }

  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  const stripe = new Stripe(key, { apiVersion: "2023-10-16" });

  const origin = getOrigin(req);
  const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/plans?success=1`;
  const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/plans?canceled=1`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: userId,
    line_items: [{ price: price_id, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Consider setting allow_promotion_codes, customer_creation, etc.
  });

  return NextResponse.json({ id: session.id, url: session.url });
}), { credentials: true });
