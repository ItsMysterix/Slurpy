"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/lib/use-plan";
import { getCheckoutUrl } from "@/lib/pay";

const features = {
  free: [
    "100 chats total",
    "Memory retention: 24 hours",
    "7-day history (view-only beyond 24h)",
    "Basic Insights",
    "1 daily nudge",
    "Monthly export",
  ],
  pro: [
    "5,000 chats / month",
    "Full memory retention",
    "Unlimited journaling",
    "Full & streaming insights",
    "Advanced interventions (JITAI, streak, repair)",
    "Priority support (24h)",
    "On-demand exports",
    "Early access features",
  ],
  elite: [
    "3D Face voice-to-voice (soon)",
    "Emotion-aware voice mirroring",
    "Voice journaling + transcription",
    "Persona voices",
    "Higher message caps",
    "Concierge support",
  ],
};

export default function ClientPage() {
  return (
    <Suspense fallback={<div className="px-4 py-8 text-sm text-muted-foreground">Loading…</div>}>
      <PlansView />
    </Suspense>
  );
}

function PlansView() {
  const { isPro, loading } = usePlan();
  const router = useRouter();
  const qp = useSearchParams();
  const success = qp?.get("success") === "1";
  const canceled = qp?.get("canceled") === "1";

  const proPriceId = useMemo(() => {
    if (typeof window === "undefined") return "";
    // Support both naming schemes: NEXT_PUBLIC_STRIPE_PRICE_PRO and NEXT_PUBLIC_STRIPE_PRICE_ID_PRO
    const id =
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ||
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO ||
      "";
    return id;
  }, []);

  useEffect(() => {
    if (!loading && isPro) {
      router.replace("/"); // Hide this page if already Pro/Elite
    }
  }, [isPro, loading, router]);

  const goPro = async () => {
    if (!proPriceId) {
      // Avoid throwing in production; disable button instead
      if (process.env.NODE_ENV !== "production") console.warn("Missing Stripe price id (NEXT_PUBLIC_STRIPE_PRICE_PRO or _ID_PRO)");
      return;
    }
    const url = await getCheckoutUrl(proPriceId);
    window.location.href = url;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Choose your plan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Free is a day-pass brain. Pro unlocks full memory and deeper insights.
        </p>
      </header>

      {success && (
        <div className="mb-4 rounded-lg border border-green-300/50 bg-green-100/40 text-green-900 dark:text-green-200 px-4 py-3 text-sm">
          Payment successful. Your plan will update shortly.
        </div>
      )}
      {canceled && (
        <div className="mb-4 rounded-lg border border-yellow-300/50 bg-yellow-100/40 text-yellow-900 dark:text-yellow-200 px-4 py-3 text-sm">
          Checkout canceled. You can try again anytime.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Free */}
        <PlanCard
          title="Free"
          subtitle="Day Pass"
          price="$0"
          period="/mo"
          cta="Current Plan"
          features={features.free}
          highlight={false}
          disabled
        />

        {/* Pro */}
        <PlanCard
          title="Pro"
          subtitle="Full Memory"
          price="$17"
          period="/mo"
          cta="Go Pro"
          onClick={goPro}
          features={features.pro}
          highlight
          badge="Most popular"
          disabled={!proPriceId}
        />

        {/* Elite (coming soon) */}
        <PlanCard
          title="Elite"
          subtitle="3D Face Companion"
          price="$29–35"
          period="/mo"
          cta="Coming soon"
          features={features.elite}
          comingSoon
          disabled
        />
      </div>
    </div>
  );
}

function PlanCard({
  title,
  subtitle,
  price,
  period,
  cta,
  onClick,
  features,
  highlight,
  badge,
  disabled,
  comingSoon,
}: {
  title: string;
  subtitle?: string;
  price: string;
  period: string;
  cta: string;
  onClick?: () => void;
  features: string[];
  highlight?: boolean;
  badge?: string;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur shadow-sm flex flex-col",
        highlight
          ? "border-yellow-400/60 ring-1 ring-yellow-300/40"
          : "border-sage-200/60 dark:border-gray-700/60",
        disabled ? "opacity-90" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {title}
            {highlight && <Sparkles className="w-4 h-4 text-yellow-500" />}
          </h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {badge && (
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border border-yellow-400/40">
            {badge}
          </span>
        )}
      </div>

      <div className="mb-6">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-sm text-muted-foreground ml-1">{period}</span>
      </div>

      <ul className="space-y-2 mb-6">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 text-green-600" />
            <span className="text-sm">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {comingSoon ? (
          <Button disabled variant="outline" className="w-full">
            <Sparkles className="w-4 h-4 mr-2" /> Coming soon
          </Button>
        ) : onClick ? (
          <Button
            onClick={onClick}
            className={
              highlight
                ? "w-full bg-gradient-to-r from-yellow-500 to-orange-500"
                : "w-full"
            }
            disabled={disabled}
          >
            {cta}
          </Button>
        ) : (
          <Button disabled={disabled} variant="outline" className="w-full">
            {cta}
          </Button>
        )}
      </div>
    </div>
  );
}
