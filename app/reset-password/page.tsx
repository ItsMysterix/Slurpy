"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Loader2, Lock, ArrowLeft, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "default-no-store";

export default function ResetPasswordPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { isLoaded, signIn, setActive } = useSignIn();

  const [ticketOK, setTicketOK] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 1: Validate the emailed reset link (ticket)
  useEffect(() => {
    if (!isLoaded) return;
    const ticket = search.get("__clerk_ticket");
    if (!ticket) {
      setErr("Missing or invalid reset link.");
      return;
    }
    (async () => {
      try {
        // ---- CHANGED: attempt link strategy (cast for older @clerk/types) ----
        const res = await (signIn as any).attemptFirstFactor({
          strategy: "reset_password_email_link",
          ticket,
        });

        if (res?.status === "needs_new_password") {
          setTicketOK(true);
        } else if (res?.status === "complete") {
          await setActive!({ session: res.createdSessionId });
          router.push("/chat");
        } else {
          setErr("This reset link is invalid or expired. Please request a new one.");
        }
      } catch (e: any) {
        setErr(e?.errors?.[0]?.message || e?.message || "Invalid or expired reset link.");
      }
    })();
  }, [isLoaded, search, signIn, setActive, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !ticketOK) return;

    // Basic checks
    if (!password || !confirm) {
      setErr("Please fill in both password fields.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      // Step 2: Set the new password in Clerk
      const res = await signIn!.resetPassword({
        password,
        signOutOfOtherSessions: true,
      });

      // If Clerk auto-created a session, go straight in
      const sessionId = (res as any)?.createdSessionId;
      if (sessionId) {
        await setActive!({ session: sessionId });
        router.push("/chat");
        return;
      }

      // Otherwise, back to sign-in with a success flag
      router.push("/sign-in?reset=done");
    } catch (e: any) {
      setErr(e?.errors?.[0]?.message || e?.message || "Could not set new password.");
    } finally {
      setBusy(false);
    }
  };

  // Loading / ticket validation state
  if (!ticketOK) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-sand-50/70 backdrop-blur-lg rounded-3xl p-8 shadow-soft border border-white/20">
          {!err ? (
            <div className="flex items-center justify-center gap-3 text-sage-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-sans">Validating reset link…</span>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <p className="font-sans">{err}</p>
              </div>
              <Link href="/forgot-password" className="inline-flex items-center gap-2 text-sage-600 hover:text-sage-500">
                <ArrowLeft className="h-4 w-4" />
                Try again
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Form to choose new password (respects current theme; no theme forcing)
  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="bg-sand-50/70 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl p-10 shadow-soft border border-white/20 dark:border-gray-700/30">
          <div className="mb-6">
            <Link
              href="/sign-in"
              className="inline-flex items-center text-sage-500 hover:text-sage-600 dark:text-sand-300 dark:hover:text-sand-200 font-sans text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Sign In
            </Link>
          </div>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-sage-400 to-sage-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-display text-2xl font-bold text-sage-600 dark:text-sand-200">
              Choose a new password
            </h1>
            <p className="text-sage-400 dark:text-sand-400 font-sans text-sm mt-1">
              Enter and confirm your new password below.
            </p>
          </div>

          {err && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-red-700 font-sans text-sm">{err}</p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sage-600 dark:text-sand-300 font-sans text-sm font-medium">
                New password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  disabled={busy}
                  className="pl-10 pr-10 rounded-xl border-sand-200 dark:border-gray-600 bg-white/50 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800 font-sans disabled:opacity-50"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sage-400 hover:text-sage-600 dark:text-sand-400 dark:hover:text-sand-300"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-sage-400 dark:text-sand-400 font-sans">Minimum 8 characters.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-sage-600 dark:text-sand-300 font-sans text-sm font-medium">
                Confirm new password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                  disabled={busy}
                  className="pl-10 pr-10 rounded-xl border-sand-200 dark:border-gray-600 bg-white/50 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800 font-sans disabled:opacity-50"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sage-400 hover:text-sage-600 dark:text-sand-400 dark:hover:text-sand-300"
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating…
                </span>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
