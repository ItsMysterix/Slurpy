"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Chrome, Mail, Lock, User, Eye, EyeOff, Loader2 } from "lucide-react"
import { useSignUp, useAuth } from "@clerk/nextjs"

import { FloatingLeaves } from "@/components/floating-leaves"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SignUpPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { isLoaded, signUp, setActive } = useSignUp()

  const [showPassword, setShowPassword] = useState(false)
  const [isLoadingForm, setIsLoadingForm] = useState(false)
  const [isLoadingOAuth, setIsLoadingOAuth] = useState(false)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  })

  useEffect(() => {
    if (isSignedIn) router.push("/chat")
  }, [isSignedIn])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }))

  const isFormValid =
    formData.firstName && formData.lastName && formData.email && formData.password

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !isFormValid) return
    setIsLoadingForm(true)
    try {
      await signUp.create({
        firstName: formData.firstName,
        lastName: formData.lastName,
        emailAddress: formData.email,
        password: formData.password,
      })

      await setActive({ session: signUp.createdSessionId })
      router.push("/chat")
    } catch (err) {
      console.error("Sign up error:", err)
      alert("Could not create account")
    } finally {
      setIsLoadingForm(false)
    }
  }

  const handleOAuthSignUp = async () => {
    if (!isLoaded) return
    setIsLoadingOAuth(true)
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-up",
        redirectUrlComplete: "/chat",
      })
    } catch (err) {
      console.error("Google sign up error:", err)
      alert("Google sign up failed")
    } finally {
      setIsLoadingOAuth(false)
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4 relative">
      <FloatingLeaves />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-sand-50/70 backdrop-blur-lg rounded-3xl p-10 shadow-soft border border-white/20">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.h1 className="font-display text-3xl font-bold text-sage-500 mb-2">
              Join Slurpy 🌱
            </motion.h1>
            <motion.p className="text-sage-400 font-sans text-sm">
              Slurpy is designed to support, not judge.
            </motion.p>
          </div>

          {/* OAuth */}
          <div className="space-y-3 mb-8">
            <Button
              onClick={handleOAuthSignUp}
              disabled={isLoadingOAuth}
              variant="outline"
              className="w-full flex items-center justify-center gap-3 rounded-xl border-sand-200 bg-white/50 hover:bg-sage-100 py-6 font-sans font-medium text-sage-600 transition-all duration-200 disabled:opacity-50"
            >
              {isLoadingOAuth ? <Loader2 className="h-5 w-5 animate-spin" /> : <Chrome className="h-5 w-5" />}
              Continue with Google
            </Button>
          </div>

          {/* Form */}
          <motion.form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sage-600 font-sans text-sm font-medium">
                  First name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    disabled={isLoadingForm}
                    className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                    placeholder="John"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sage-600 font-sans text-sm font-medium">
                  Last name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    disabled={isLoadingForm}
                    className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                    placeholder="Doe"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sage-600 font-sans text-sm font-medium">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={isLoadingForm}
                  className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sage-600 font-sans text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoadingForm}
                  className="pl-10 pr-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoadingForm}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sage-400 hover:text-sage-600 disabled:opacity-50"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
              <Button
                type="submit"
                disabled={!isFormValid || isLoadingForm}
                className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingForm ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating account...
                  </span>
                ) : (
                  "Create account"
                )}
              </Button>
            </motion.div>
          </motion.form>

          {/* Footer switch */}
          <div className="text-center mt-6">
            <p className="text-sage-400 font-sans text-sm">
              Already have an account?{" "}
              <Link href="/sign-in" className="text-sage-500 hover:text-sage-600 font-medium underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Terms footer */}
        <div className="text-center mt-6 px-4">
          <p className="text-sage-400 font-sans text-xs leading-relaxed">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-sage-500">Terms of Service</Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-sage-500">Privacy Policy</Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
