"use client"

import * as React from "react"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Mail, ArrowLeft, Loader2, CheckCircle, RefreshCw } from "lucide-react"
import { useSignUp, useAuth } from "@/lib/auth-hooks"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabaseClient"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export default function EmailVerificationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sage-500" />
      </div>
    }>
      <EmailVerificationInner />
    </Suspense>
  )
}

function EmailVerificationInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isSignedIn } = useAuth()
  const { isLoaded, signUp, setActive } = useSignUp()
  const { setTheme, theme } = useTheme()

  const emailFromParams = searchParams.get("email") || ""
  const [displayEmail, setDisplayEmail] = useState(emailFromParams)
  const [isResending, setIsResending] = useState(false)
  const [errMsg, setErrMsg] = useState("")
  const [success, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Force light theme on auth screens
  useEffect(() => {
    const prev = theme
    setTheme("light")
    return () => {
      if (prev && prev !== "light") setTheme(prev)
    }
  }, [setTheme, theme])

  // If already authenticated, go to chat
  useEffect(() => {
    if (isSignedIn) router.push("/chat")
  }, [isSignedIn, router])

  // Hydrate email from signUp if available
  useEffect(() => {
    if (isLoaded && signUp && !displayEmail) {
      const e = (signUp as any)?.emailAddress
      if (e) setDisplayEmail(e)
    }
  }, [isLoaded, signUp, displayEmail])

  // start resend cooldown on first render
  useEffect(() => {
    setResendTimer(60)
    const t = setInterval(() => setResendTimer(s => (s <= 1 ? (clearInterval(t), 0) : s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  // In Supabase, signup verification is via email magic link. We subscribe for session and redirect when ready.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        (async () => {
          try {
            const pendingRaw = localStorage.getItem("slurpy_pending_avatar")
            if (pendingRaw) {
              const pending = JSON.parse(pendingRaw) as { name: string; type: string; b64: string }
              const uid = session.user?.id
              if (uid) {
                const bytes = Uint8Array.from(atob(pending.b64), c => c.charCodeAt(0))
                const path = `${uid}/avatar_${Date.now()}`
                const { data: up, error: upErr } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: pending.type, upsert: true })
                if (!upErr && up) {
                  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(up.path)
                  await supabase.auth.updateUser({ data: { avatar_url: pub.publicUrl } })
                }
              }
              localStorage.removeItem("slurpy_pending_avatar")
            }
          } catch {}
          setSuccess(true)
          setTimeout(() => router.push("/chat"), 800)
        })()
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [router])

  const resend = async () => {
    if (resendTimer > 0 || !displayEmail) return
    setIsResending(true)
    setErrMsg("")
    try {
      await supabase.auth.resend({ type: "signup", email: displayEmail })
      setResendTimer(60)
      const t = setInterval(() => setResendTimer(s => (s <= 1 ? (clearInterval(t), 0) : s - 1)), 1000)
    } catch (e) {
      setErrMsg("Failed to resend email. Please try again.")
    } finally {
      setIsResending(false)
    }
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sage-500" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-sage-500 to-clay-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-sage-500 mb-2">Email Verified!</h1>
          <p className="text-sage-400 font-sans">Taking you to Slurpy…</p>
        </motion.div>
      </div>
    )
  }

  // Main verification UI (link-based)
  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="bg-sand-50/70 backdrop-blur-lg rounded-3xl p-10 shadow-soft border border-white/20">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-sage-400 to-clay-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-display text-2xl font-bold text-sage-500 mb-2">Check your email</h1>
            <p className="text-sage-400 font-sans text-sm leading-relaxed">
              We sent a verification link to<br />
              <span className="font-medium text-sage-500">{displayEmail || "your email"}</span>
            </p>
          </div>
          {errMsg && <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-red-500 text-sm text-center mb-4">{errMsg}</motion.p>}

          <div className="space-y-3 mb-6">
            <Button
              onClick={async () => {
                setErrMsg("");
                try {
                  // First, check current user state
                  const u1 = await supabase.auth.getUser();
                  if (u1.data.user?.email_confirmed_at) {
                    return router.push("/chat");
                  }
                  // Force a refresh of the session (in case verification happened in another tab)
                  await supabase.auth.refreshSession();
                  const u2 = await supabase.auth.getUser();
                  if (u2.data.user?.email_confirmed_at) {
                    return router.push("/chat");
                  }
                  setErrMsg("Still not verified yet. Please open the link from your email or resend it.");
                } catch (e) {
                  setErrMsg("Could not verify status. Please try again.");
                }
              }}
              className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200"
            >
              I clicked the link
            </Button>
            <Button
              onClick={resend}
              disabled={resendTimer > 0 || isResending}
              variant="outline"
              className="w-full rounded-xl py-6"
            >
              {isResending ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sending…</span>
              ) : resendTimer > 0 ? (
                `Resend email in ${resendTimer}s`
              ) : (
                <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Resend email</span>
              )}
            </Button>
          </div>

          <div className="text-center space-y-4">
            <p className="text-sage-400 font-sans text-sm">Didn’t receive the code?</p>
            <Button onClick={resend} disabled={resendTimer > 0 || isResending} variant="ghost"
              className="text-sage-500 hover:text-sage-600 font-sans font-medium underline underline-offset-2 h-auto p-0">
              {isResending ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sending…</span>
              ) : resendTimer > 0 ? (
                `Resend code in ${resendTimer}s`
              ) : (
                <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Resend code</span>
              )}
            </Button>
          </div>

          <div className="text-center mt-6 pt-6 border-t border-sand-200/50">
            <Link href="/sign-up" className="inline-flex items-center gap-2 text-sage-400 hover:text-sage-500 font-sans text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to sign up
            </Link>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }} className="text-center mt-6 px-4">
          <p className="text-sage-400 font-sans text-xs leading-relaxed">
            Check your spam folder if you don’t see the email. The link typically expires soon for security.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
