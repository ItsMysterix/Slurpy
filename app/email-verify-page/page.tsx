"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Mail, ArrowLeft, Loader2, CheckCircle, RefreshCw } from "lucide-react"
import { useSignUp, useAuth } from "@clerk/nextjs"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function EmailVerificationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isSignedIn } = useAuth()
  const { isLoaded, signUp, setActive } = useSignUp()
  const { setTheme, theme } = useTheme()

  // Get email from URL params or signUp object
  const emailFromParams = searchParams.get("email")
  const email = emailFromParams || signUp?.emailAddress || ""

  const [code, setCode] = useState(["", "", "", "", "", ""])
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Refs for input focus management
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Force light mode on this page
  useEffect(() => {
    const originalTheme = theme
    setTheme("light")
    
    return () => {
      if (originalTheme && originalTheme !== "light") {
        setTheme(originalTheme)
      }
    }
  }, [setTheme, theme])

  // Redirect if already signed in
  useEffect(() => {
    if (isSignedIn) {
      router.push("/chat")
    }
  }, [isSignedIn, router])

  // Redirect if no sign-up in progress
  useEffect(() => {
    if (isLoaded && !signUp) {
      router.push("/sign-up")
    }
  }, [isLoaded, signUp, router])

  // Start resend timer
  useEffect(() => {
    setResendTimer(60) // 60 seconds cooldown
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)
    setError("")

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-verify when all 6 digits are entered
    if (newCode.every(digit => digit !== "") && value) {
      handleVerify(newCode.join(""))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 6).split("")
    
    const newCode = [...code]
    digits.forEach((digit, index) => {
      if (index < 6) newCode[index] = digit
    })
    setCode(newCode)

    // Focus the next empty input or last input
    const nextEmptyIndex = newCode.findIndex(digit => digit === "")
    const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex
    inputRefs.current[focusIndex]?.focus()

    // Auto-verify if all digits filled
    if (newCode.every(digit => digit !== "")) {
      handleVerify(newCode.join(""))
    }
  }

  const handleVerify = async (verificationCode?: string) => {
    const codeToVerify = verificationCode || code.join("")
    
    if (codeToVerify.length !== 6) {
      setError("Please enter all 6 digits")
      return
    }

    if (!signUp) {
      setError("No sign-up in progress. Please start over.")
      return
    }

    setIsVerifying(true)
    setError("")

    try {
      const verificationResult = await signUp.attemptEmailAddressVerification({
        code: codeToVerify
      })

      if (verificationResult.status === "complete") {
        setSuccess(true)
        await setActive({ session: verificationResult.createdSessionId })
        
        // Small delay to show success state
        setTimeout(() => {
          router.push("/chat")
        }, 1000)
      } else {
        setError("Verification incomplete. Please try again.")
      }
    } catch (err: any) {
      console.error("Email verification error:", err)
      const errorMessage = err?.errors?.[0]?.message || "Invalid verification code. Please try again."
      setError(errorMessage)
      
      // Clear the code on error
      setCode(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResendCode = async () => {
    if (!signUp || resendTimer > 0) return

    setIsResending(true)
    setError("")

    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
      setResendTimer(60) // Reset timer
      
      // Start new countdown
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      console.error("Resend error:", err)
      setError("Failed to resend code. Please try again.")
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
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-sage-500 to-clay-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-sage-500 mb-2">Email Verified!</h1>
          <p className="text-sage-400 font-sans">Taking you to Slurpy...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-sand-50/70 backdrop-blur-lg rounded-3xl p-10 shadow-soft border border-white/20"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-sage-400 to-clay-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-display text-2xl font-bold text-sage-500 mb-2">
              Check your email
            </h1>
            <p className="text-sage-400 font-sans text-sm leading-relaxed">
              We sent a 6-digit verification code to
              <br />
              <span className="font-medium text-sage-500">{email}</span>
            </p>
          </div>

          {/* Code Input */}
          <div className="mb-6">
            <div className="flex gap-3 justify-center mb-4">
              {code.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className="w-12 h-12 text-center text-lg font-semibold rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans"
                  disabled={isVerifying || success}
                />
              ))}
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-500 text-sm text-center font-sans"
              >
                {error}
              </motion.p>
            )}
          </div>

          {/* Verify Button */}
          <Button
            onClick={() => handleVerify()}
            disabled={code.some(digit => digit === "") || isVerifying || success}
            className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200 mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifying ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </span>
            ) : (
              "Verify Email"
            )}
          </Button>

          {/* Resend Code */}
          <div className="text-center space-y-4">
            <p className="text-sage-400 font-sans text-sm">
              Didn't receive the code?
            </p>
            
            <Button
              onClick={handleResendCode}
              disabled={resendTimer > 0 || isResending}
              variant="ghost"
              className="text-sage-500 hover:text-sage-600 font-sans font-medium underline underline-offset-2 h-auto p-0"
            >
              {isResending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </span>
              ) : resendTimer > 0 ? (
                `Resend code in ${resendTimer}s`
              ) : (
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Resend code
                </span>
              )}
            </Button>
          </div>

          {/* Back to Sign Up */}
          <div className="text-center mt-6 pt-6 border-t border-sand-200/50">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 text-sage-400 hover:text-sage-500 font-sans text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign up
            </Link>
          </div>
        </motion.div>

        {/* Help Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-6 px-4"
        >
          <p className="text-sage-400 font-sans text-xs leading-relaxed">
            Check your spam folder if you don't see the email.
            <br />
            The code expires in 10 minutes.
          </p>
        </motion.div>
      </div>
    </div>
  )
}