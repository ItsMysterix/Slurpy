"use client"

import * as React from "react"
import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Mail, ArrowLeft, Loader2, CheckCircle, RefreshCw } from "lucide-react"
import { useSignUp, useAuth } from "@clerk/nextjs"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const revalidate = 0

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

  const [code, setCode] = useState(["", "", "", "", "", ""])
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [errMsg, setErrMsg] = useState("")
  const [success, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

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

  // When Clerk hydrates, pull email from signUp if needed
  useEffect(() => {
    if (isLoaded && signUp && !displayEmail) {
      // signUp.emailAddress can be undefined until create() has run
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

  const onCodeChange = (i: number, v: string) => {
    if (v && !/^\d$/.test(v)) return
    const next = [...code]
    next[i] = v
    setCode(next)
    setErrMsg("")
    if (v && i < 5) inputRefs.current[i + 1]?.focus()
    if (next.every(d => d !== "") && v) void verify(next.join(""))
  }

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) inputRefs.current[i - 1]?.focus()
  }

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("")
    const filled = [...code]
    digits.forEach((d, i) => { if (i < 6) filled[i] = d })
    setCode(filled)
    const nextEmpty = filled.findIndex(d => d === "")
    inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus()
    if (filled.every(d => d !== "")) void verify(filled.join(""))
  }

  const verify = async (value?: string) => {
    if (!isLoaded || !signUp) return
    const codeToVerify = value ?? code.join("")
    if (codeToVerify.length !== 6) {
      setErrMsg("Please enter all 6 digits.")
      return
    }
    setIsVerifying(true)
    setErrMsg("")
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: codeToVerify })
      if (res.status === "complete") {
        setSuccess(true)
        await setActive({ session: res.createdSessionId })
        setTimeout(() => router.push("/chat"), 800)
      } else {
        setErrMsg("Verification incomplete. Please try again.")
      }
    } catch (err: any) {
      const message = err?.errors?.[0]?.message || "Invalid verification code. Please try again."
      setErrMsg(message)
      setCode(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setIsVerifying(false)
    }
  }

  const resend = async () => {
    if (!isLoaded || !signUp || resendTimer > 0) return
    setIsResending(true)
    setErrMsg("")
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
      setResendTimer(60)
      const t = setInterval(() => setResendTimer(s => (s <= 1 ? (clearInterval(t), 0) : s - 1)), 1000)
    } catch (e) {
      setErrMsg("Failed to resend code. Please try again.")
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

  // Main OTP UI
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
              We sent a 6-digit verification code to<br />
              <span className="font-medium text-sage-500">{displayEmail || "your email"}</span>
            </p>
          </div>

          <div className="mb-6">
            <div className="flex gap-3 justify-center mb-4">
              {code.map((digit, i) => (
                <Input
                  key={i}
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => onCodeChange(i, e.target.value)}
                  onKeyDown={e => onKeyDown(i, e)}
                  onPaste={i === 0 ? onPaste : undefined}
                  className="w-12 h-12 text-center text-lg font-semibold rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans"
                  disabled={isVerifying}
                />
              ))}
            </div>
            {errMsg && <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-red-500 text-sm text-center">{errMsg}</motion.p>}
          </div>

          <Button
            onClick={() => verify()}
            disabled={code.some(d => !d) || isVerifying}
            className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200 mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifying ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</span> : "Verify Email"}
          </Button>

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
            Check your spam folder if you don’t see the email. The code expires in 10 minutes.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
