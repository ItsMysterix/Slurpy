"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function CallbackInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = search.get("code");
    const nextUrl = search.get("next") || "/chat";
    const next = async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // If a pending avatar exists (from sign-up), upload and attach it now
        try {
          const pendingRaw = localStorage.getItem("slurpy_pending_avatar");
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw) as { name: string; type: string; b64: string };
            const { data: u } = await supabase.auth.getUser();
            const uid = u.user?.id;
            if (uid) {
              const bytes = Uint8Array.from(atob(pending.b64), (c) => c.charCodeAt(0));
              const path = `${uid}/avatar_${Date.now()}`;
              const { data: up, error: upErr } = await supabase.storage
                .from("avatars")
                .upload(path, bytes, { contentType: pending.type, upsert: true });
              if (!upErr && up) {
                const { data: pub } = supabase.storage.from("avatars").getPublicUrl(up.path);
                await supabase.auth.updateUser({ data: { avatar_url: pub.publicUrl } });
              }
            }
            localStorage.removeItem("slurpy_pending_avatar");
          }
        } catch {}
        router.replace(nextUrl);
      } catch (e: any) {
        setError(e?.message || "Authentication failed");
        // Fallback after brief pause
        setTimeout(() => router.replace("/sign-in"), 1200);
      }
    };
    void next();
  }, [router, search]);

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="flex items-center gap-2 text-sage-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-sans">
          {error ? `Redirecting… (${error})` : "Completing sign-in…"}
        </span>
      </div>
    </div>
  );
}

export default function SSOCallback() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center p-6">
          <div className="flex items-center gap-2 text-sage-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-sans">Completing sign-in…</span>
          </div>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
