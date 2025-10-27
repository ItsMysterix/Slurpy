// app/reset-password/page.tsx
"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Mail,
  Eye,
  EyeOff,
  Lock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

function ResetPasswordInner() {
  const router = useRouter();
  const search = useSearchParams();
  // Email should be passed from the Forgot Password page as ?email=...
  const email = search.get("email") || "";

  // New password UI
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // State
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // On arrival, if Supabase provided a code, exchange it for a session so we can set a new password
  useEffect(() => {
    const code = search.get("code");
    const doExchange = async () => {
      if (!code) { setReady(true); return; }
      try {
        setBusy(true);
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        setReady(true);
      } catch (e: any) {
        setError(e?.message || "Invalid or expired reset link. Please start over.");
        setReady(false);
      } finally {
        setBusy(false);
      }
    };
    void doExchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitNewPassword = async () => {
    if (!ready) return;

    if (!password || !confirm) {
      setError("Please fill in both password fields.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push("/chat");
    } catch (e: any) {
      const msg = (e?.message as string) || "Could not set new password. Please try again.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!ready && !error) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="flex items-center gap-2 text-sage-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="font-sans">Preparing reset…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 dark:from-slate-900 dark:via-slate-950 dark:to-black flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-sand-50/70 dark:bg-gray-900/70 backdrop-blur-lg rounded-3xl p-8 shadow-soft border border-white/20 dark:border-gray-700/30">
          {/* Back link */}
          <div className="mb-4">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 text-sage-600 dark:text-sand-300 hover:opacity-80 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sign In
            </Link>
          </div>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sage-400 to-sage-500 grid place-items-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <h1 className="font-display text-2xl font-bold text-sage-600 dark:text-sand-200">
              Choose a new password
            </h1>
            <p className="text-sage-400 dark:text-sand-400 font-sans text-sm mt-1">
              {email ? <>You requested a reset for <span className="font-medium text-sage-600 dark:text-sand-200">{email}</span>.</> : null} Enter and confirm your new password below.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-red-700 font-sans text-sm">{error}</p>
            </div>
          )}
          {/* New Password */}
          {ready && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitNewPassword();
              }}
              className="space-y-5"
            >
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
                    className="pl-10 pr-10 rounded-xl border-sand-200 dark:border-gray-600 bg-white/60 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800"
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
                <p className="text-xs text-sage-400 dark:text-sand-400">Minimum 8 characters.</p>
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
                    className="pl-10 pr-10 rounded-xl border-sand-200 dark:border-gray-600 bg-white/60 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800"
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
                className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans"
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
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center p-4">
          <div className="flex items-center gap-2 text-sage-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-sans">Loading…</span>
          </div>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
