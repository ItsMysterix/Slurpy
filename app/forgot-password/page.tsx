"use client"

import type React from "react"

import { motion } from "framer-motion"
import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Mail, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { useSignIn } from "@clerk/nextjs"
import { ClerkAPIError } from "@clerk/types"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [resendCount, setResendCount] = useState(0)
  const [canResend, setCanResend] = useState(true)

  const { signIn, isLoaded } = useSignIn()

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isLoaded) {
      setError("Authentication service is loading. Please try again.")
      return
    }

    if (!email) {
      setError("Please enter your email address")
      return
    }

    if (!validateEmail(email)) {
      setError("Please enter a valid email address")
      return
    }

    setError("")
    setIsSubmitting(true)

    try {
      // Use Clerk's password reset functionality
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      })

      setIsSubmitted(true)
      setResendCount((prev) => prev + 1)
    } catch (err) {
      console.error("Password reset error:", err)
      
      // Type guard to check if it's a Clerk API error
      if (
        err && 
        typeof err === 'object' && 
        'errors' in err && 
        Array.isArray((err as any).errors) &&
        (err as any).errors.length > 0
      ) {
        const firstError = (err as any).errors[0]
        
        if (firstError && typeof firstError === 'object' && 'code' in firstError) {
          const errorCode = firstError.code
          const errorMessage = firstError.message
          
          switch (errorCode) {
            case "form_identifier_not_found":
              setError("No account found with this email address.")
              break
            case "form_password_pwned":
              setError("This email has been involved in a data breach. Please contact support.")
              break
            case "throttled":
              setError("Too many attempts. Please wait before trying again.")
              break
            default:
              setError(errorMessage || "Failed to send reset email. Please try again.")
          }
        } else {
          setError("Failed to send reset email. Please try again.")
        }
      } else if (err instanceof Error) {
        // Handle regular Error objects
        setError(err.message || "Failed to send reset email. Please try again.")
      } else {
        setError("An unexpected error occurred. Please try again.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!canResend || !isLoaded) return

    setCanResend(false)
    setIsSubmitting(true)

    try {
      // Resend the password reset email using Clerk
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      })
      
      setResendCount((prev) => prev + 1)

      // Enable resend after 30 seconds
      setTimeout(() => setCanResend(true), 30000)
    } catch (err) {
      console.error("Resend error:", err)
      
      // Handle Clerk API errors properly
      if (
        err && 
        typeof err === 'object' && 
        'errors' in err && 
        Array.isArray((err as any).errors) &&
        (err as any).errors.length > 0
      ) {
        const firstError = (err as any).errors[0]
        if (firstError && typeof firstError === 'object' && 'message' in firstError) {
          setError(firstError.message || "Failed to resend email. Please try again.")
        } else {
          setError("Failed to resend email. Please try again.")
        }
      } else {
        setError("Failed to resend email. Please try again.")
      }
      setCanResend(true) // Re-enable resend if there's an error
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading state while Clerk initializes
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
        <Card className="bg-sand-50/70 backdrop-blur-lg shadow-soft border border-white/20">
          <CardContent className="p-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-sage-500" />
            <p className="text-sage-500 font-sans">Loading authentication...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <Card className="bg-sand-50/70 backdrop-blur-lg shadow-soft border border-white/20">
            <CardContent className="p-10 text-center">
              <motion.div
                className="w-16 h-16 bg-sage-500 rounded-full flex items-center justify-center mx-auto mb-6"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <CheckCircle className="w-8 h-8 text-white" />
              </motion.div>

              <motion.h2
                className="font-display text-3xl text-sage-600 mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                Check Your Email
              </motion.h2>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p className="text-sage-500 mb-2 font-sans">We've sent a password reset link to:</p>
                <p className="text-sage-600 font-medium font-sans mb-6 bg-sage-100 px-4 py-2 rounded-xl">{email}</p>
                <p className="text-sm text-sage-400 mb-8 font-sans leading-relaxed">
                  If you don't see the email, check your spam folder. The link will expire in 24 hours.
                </p>
              </motion.div>

              <motion.div
                className="space-y-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                <Link href="/sign-in">
                  <Button className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-3 font-sans">
                    Back to Sign In
                  </Button>
                </Link>

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsSubmitted(false)
                      setEmail("")
                      setError("")
                    }}
                    className="flex-1 text-sage-600 hover:text-sage-500 font-sans"
                  >
                    Try Different Email
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={handleResend}
                    disabled={!canResend || isSubmitting}
                    className="flex-1 text-sage-600 hover:text-sage-500 font-sans disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {canResend ? "Resend Email" : "Resent!"}
                  </Button>
                </div>

                {resendCount > 0 && (
                  <p className="text-xs text-sage-400 font-sans">
                    Email sent {resendCount} time{resendCount > 1 ? "s" : ""}
                  </p>
                )}
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-4 h-4 bg-sage-300/20 rounded-full animate-pulse"></div>
        <div className="absolute top-32 right-20 w-3 h-3 bg-clay-400/20 rounded-full animate-pulse delay-1000"></div>
        <div className="absolute bottom-40 left-20 w-5 h-5 bg-sage-300/20 rounded-full animate-pulse delay-2000"></div>
        <div className="absolute bottom-20 right-32 w-2 h-2 bg-clay-400/20 rounded-full animate-pulse delay-3000"></div>
      </div>

      <motion.div
        className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <div className="bg-sand-50/70 backdrop-blur-lg rounded-3xl p-10 shadow-soft border border-white/20">
          {/* Header */}
          <div className="text-center mb-8">
            <Link
              href="/sign-in"
              className="inline-flex items-center text-sage-500 hover:text-sage-600 mb-6 font-sans text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Sign In
            </Link>

            <motion.div
              className="w-16 h-16 bg-gradient-to-br from-sage-400 to-sage-500 rounded-full flex items-center justify-center mx-auto mb-6"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              whileHover={{ scale: 1.05 }}
            >
              <Mail className="w-8 h-8 text-white" />
            </motion.div>

            <motion.h1
              className="font-display text-3xl font-bold text-sage-500 mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              Forgot Password?
            </motion.h1>
            <motion.p
              className="text-sage-400 font-sans text-sm leading-relaxed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              No worries! Enter your email and we'll send you a reset link to get back into your account.
            </motion.p>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-700 font-sans text-sm">{error}</p>
            </motion.div>
          )}

          {/* Form */}
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <div>
              <Label htmlFor="email" className="text-sage-600 font-sans text-sm font-medium">
                Email address
              </Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) setError("")
                  }}
                  disabled={isSubmitting}
                  className={`pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50 transition-all duration-200 ${
                    error ? "border-red-300 focus:border-red-400" : ""
                  }`}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
              <Button
                type="submit"
                disabled={!email || isSubmitting}
                className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending Reset Link...
                  </div>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Reset Link
                  </>
                )}
              </Button>
            </motion.div>
          </motion.form>

          {/* Footer */}
          <motion.div
            className="text-center mt-6 space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <p className="text-sage-400 font-sans text-sm">
              Remember your password?{" "}
              <Link
                href="/sign-in"
                className="text-sage-500 hover:text-sage-600 font-medium underline underline-offset-2 transition-colors"
              >
                Sign in
              </Link>
            </p>

            <p className="text-sage-400 font-sans text-sm">
              Don't have an account?{" "}
              <Link
                href="/sign-up"
                className="text-sage-500 hover:text-sage-600 font-medium underline underline-offset-2 transition-colors"
              >
                Sign up
              </Link>
            </p>
          </motion.div>
        </div>

        {/* Help Text */}
        <motion.div
          className="text-center mt-6 px-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <p className="text-sage-400 font-sans text-xs leading-relaxed">
            Having trouble? Contact our support team at{" "}
            <a href="mailto:support@slurpy.ai" className="underline hover:text-sage-500 transition-colors">
              support@slurpy.ai
            </a>
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}