export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createServerServiceClient } from "@/lib/supabase/server";

type Plan = "free" | "pro" | "elite";

function mapPriceToPlan(priceId: string | null | undefined): Plan {
  const pro = process.env.STRIPE_PRICE_PRO || "";
  const elite = process.env.STRIPE_PRICE_ELITE || "";
  if (priceId && elite && priceId === elite) return "elite";
  if (priceId && pro && priceId === pro) return "pro";
  // Default: treat other prices as pro; adjust if you have more tiers
  return priceId ? "pro" : "free";
}

async function setUserPlan(userId: string, plan: Plan) {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    await client.users.updateUser(userId, { publicMetadata: { plan } });
  } catch (e) {
    logger.error("setUserPlan error", (e as any)?.message || e);
  }
}

async function upsertCustomerMap(userId: string, stripeCustomerId: string) {
  const sb = createServerServiceClient();
  try {
    await sb.from("billing_customers").upsert({ user_id: userId, stripe_customer_id: stripeCustomerId }, { onConflict: "user_id" });
  } catch (e) {
    logger.error("upsertCustomerMap error", (e as any)?.message || e);
  }
}

async function findUserIdByCustomer(stripeCustomerId: string): Promise<string | null> {
  try {
    const sb = createServerServiceClient();
    const { data, error } = await sb
      .from("billing_customers")
      .select("user_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    if (error || !data) return null;
    return data.user_id as string;
  } catch {
    return null;
  }
}

async function markEventProcessed(id: string, type: string): Promise<boolean> {
  const sb = createServerServiceClient();
  const { error } = await sb.from("webhook_events").insert({ id, type }).select("id");
  if (!error) return true;
  // If conflict on primary key, consider processed already
  if ((error as any)?.code === "23505" || /duplicate key/i.test((error as any)?.message || "")) return false;
  // If table doesn't exist yet (local/dev without migration), do not log noisily
  if ((error as any)?.code === "42P01" || /relation .* does not exist/i.test((error as any)?.message || "")) {
    return false; // treat as already processed to keep webhook idempotent
  }
  // Unknown error: log in production only to reduce noise in tests
  if (process.env.NODE_ENV === "production") {
    logger.error("webhook_events insert error", (error as any)?.message || error);
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature") || "";
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

    const raw = Buffer.from(await req.arrayBuffer());

    let stripe: Stripe | null = null;
    try {
      const key = process.env.STRIPE_SECRET_KEY || "";
  stripe = new Stripe(key || "sk_test_000000000000000000000000", { apiVersion: "2023-10-16" });
    } catch (e) {
      logger.error("Stripe init failed", (e as any)?.message || e);
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    // E2E friendliness: allow generateTestHeaderString usage in tests (requires whSecret set in env)
    let event: Stripe.Event;
    try {
      if (!whSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
      event = stripe!.webhooks.constructEvent(raw, sig, whSecret);
    } catch (err: any) {
      // Reduce noise in test/dev: only warn loudly in production
      if (process.env.NODE_ENV === "production") {
        logger.warn("Invalid stripe signature", err?.message || err);
      }
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }

    // Idempotency: if already processed, return ok
    const firstTime = await markEventProcessed(event.id, event.type || "unknown");
    if (!firstTime) {
      return NextResponse.json({ ok: true, dedup: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = (session.client_reference_id as string) || "";
        const customerId = (session.customer as string) || "";
        if (userId && customerId) await upsertCustomerMap(userId, customerId);
        // Resolve plan by fetching subscription
        let plan: Plan = "pro";
        try {
          if (session.subscription) {
            const sub = await stripe!.subscriptions.retrieve(session.subscription as string);
            const priceId = (sub.items?.data?.[0]?.price?.id as string) || undefined;
            plan = mapPriceToPlan(priceId);
          } else if (session.mode === "payment" && session.amount_total) {
            plan = mapPriceToPlan(session.metadata?.price_id as string);
          }
        } catch {}
        if (userId) await setUserPlan(userId, plan);
        logger.info(`stripe webhook: ${event.type} user=${userId ? userId.slice(0,6) : "?"} cust=${customerId ? customerId.slice(0,8) : "?"}`);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) || "";
        const userId = await findUserIdByCustomer(customerId);
        const priceId = (sub.items?.data?.[0]?.price?.id as string) || undefined;
        const plan = sub.status === "active" || sub.status === "trialing" ? mapPriceToPlan(priceId) : "free";
        if (userId) await setUserPlan(userId, plan);
        logger.info(`stripe webhook: ${event.type} user=${userId ? userId.slice(0,6) : "?"} cust=${customerId ? customerId.slice(0,8) : "?"}`);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) || "";
        const userId = await findUserIdByCustomer(customerId);
        if (userId) await setUserPlan(userId, "free");
        logger.info(`stripe webhook: ${event.type} user=${userId ? userId.slice(0,6) : "?"} cust=${customerId ? customerId.slice(0,8) : "?"}`);
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = (invoice.customer as string) || "";
        const userId = await findUserIdByCustomer(customerId);
        logger.info(`stripe webhook: ${event.type} user=${userId ? userId.slice(0,6) : "?"} cust=${customerId ? customerId.slice(0,8) : "?"}`);
        break;
      }
      default:
        // ignore other events
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    logger.error("stripe webhook error", e?.message || e);
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}
