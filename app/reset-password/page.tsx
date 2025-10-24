// app/reset-password/page.tsx
"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
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
  const { isLoaded, signIn, setActive } = useSignIn();

  // Email should be passed from the Forgot Password page as ?email=...
  const email = search.get("email") || "";

  // OTP code UI
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // New password UI
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // State
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"code" | "password">("code");
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const codeString = code.join("");

  const handleCodeChange = (idx: number, v: string) => {
    if (v && !/^\d$/.test(v)) return;
    const next = [...code];
    next[idx] = v;
    setCode(next);
    setError(null);
    if (v && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleCodeKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePasteCode = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    const next = [...code];
    digits.forEach((d, i) => {
      if (i < 6) next[i] = d;
    });
    setCode(next);
    const firstEmpty = next.findIndex((d) => !d);
    inputRefs.current[firstEmpty === -1 ? 5 : firstEmpty]?.focus();
  };

  const attemptWithCode = async () => {
    if (!isLoaded || !signIn) return;
    if (codeString.length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 1) Submit OTP code
      const res = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: codeString,
      });

      // 2) If Clerk now needs a new password, switch phase
      if (res?.status === "needs_new_password") {
        setPhase("password");
        return;
      }

      // 3) In some cases it could be complete (unlikely)
      if (res?.status === "complete" && (res as any)?.createdSessionId) {
        await setActive?.({ session: (res as any).createdSessionId });
        router.push("/chat");
        return;
      }

      setError("Invalid or expired code. Please try again.");
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.message ||
        (e?.errors?.[0]?.code === "expired_code" && "This code has expired. Please resend a new one.") ||
        "Could not verify the code. Please try again.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async () => {
    if (!isLoaded || !signIn) return;

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
      // 3) Provide new password to finish reset
      const res = await (signIn as any).resetPassword({
        password,
        signOutOfOtherSessions: true,
        signInId: (signIn as any).id, // bind to the current in-progress reset
      });

      const sessionId = (res as any)?.createdSessionId;
      if (sessionId) {
        await setActive?.({ session: sessionId });
        router.push("/chat");
        return;
      }
      router.push("/sign-in?reset=done");
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.message ||
        (e?.errors?.[0]?.code === "password_too_short" && "Password is too short.") ||
        "Could not set new password. Please try again.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signIn || !email || resending || resendCooldown > 0) return;
    setResending(true);
    setError(null);
    try {
      await (signIn as any).create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setResendCooldown(30);
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.message ||
        "Failed to resend the code. Please try again.";
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="flex items-center gap-2 text-sage-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="font-sans">Loading…</span>
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
              {phase === "code" ? <Mail className="h-8 w-8 text-white" /> : <CheckCircle className="h-8 w-8 text-white" />}
            </div>
            <h1 className="font-display text-2xl font-bold text-sage-600 dark:text-sand-200">
              {phase === "code" ? "Enter the 6-digit code" : "Choose a new password"}
            </h1>
            <p className="text-sage-400 dark:text-sand-400 font-sans text-sm mt-1">
              {phase === "code"
                ? email
                  ? <>We sent a code to <span className="font-medium text-sage-600 dark:text-sand-200">{email}</span>.</>
                  : "Check your email inbox for the code."
                : "Enter and confirm your new password below."}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-red-700 font-sans text-sm">{error}</p>
            </div>
          )}

          {/* Phase: Code */}
          {phase === "code" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void attemptWithCode();
              }}
              className="space-y-6"
            >
              <div className="flex justify-center gap-3">
                {code.map((digit, idx) => (
                  <Input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(idx, e.currentTarget.value)}
                    onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                    onPaste={idx === 0 ? handlePasteCode : undefined}
                    className="w-12 h-12 text-center text-lg font-semibold rounded-xl border-sand-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 focus:bg-white dark:focus:bg-gray-800"
                  />
                ))}
              </div>

              <Button
                type="submit"
                disabled={busy || codeString.length !== 6}
                className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying…
                  </span>
                ) : (
                  "Verify Code"
                )}
              </Button>

              <div className="flex items-center justify-between">
                <p className="text-xs text-sage-400 dark:text-sand-400">
                  Code expires in ~10 minutes.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResend}
                  disabled={!email || resending || resendCooldown > 0}
                  className="h-auto p-0 text-sage-600 dark:text-sand-300 hover:opacity-80"
                >
                  {resending ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
                    </span>
                  ) : resendCooldown > 0 ? (
                    `Resend in ${resendCooldown}s`
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Resend code
                    </span>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Phase: New Password */}
          {phase === "password" && (
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
