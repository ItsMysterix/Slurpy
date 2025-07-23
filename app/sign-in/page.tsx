"use client"

import type React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Chrome, Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSignIn, useSignUp, useAuth } from "@clerk/nextjs"

export default function SignInPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { isLoaded: siLoaded, signIn, setActive } = useSignIn()
  const { isLoaded: suLoaded, signUp } = useSignUp()

  const [showPassword, setShowPassword] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isFormLoading, setIsFormLoading] = useState(false)
  const [formData, setFormData] = useState({ email: "", password: "" })

  useEffect(() => {
    if (isSignedIn) {
      router.push("/chat")
    }
  }, [isSignedIn])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!siLoaded || !formData.email || !formData.password) return
    setIsFormLoading(true)
    try {
      if (signIn.status === "complete") {
        router.push("/chat")
        return
      }

      const res = await signIn.create({
        identifier: formData.email,
        password: formData.password,
      })
      await setActive({ session: res.createdSessionId })
      router.push("/chat")
    } catch (err: any) {
      if (err?.errors?.[0]?.code === "identifier_not_found" && suLoaded) {
        router.push("/sign-up")
      } else if (err?.errors?.[0]?.message === "You're already signed in.") {
        router.push("/chat")
      } else {
        console.error(err)
        alert("Invalid credentials")
      }
    } finally {
      setIsFormLoading(false)
    }
  }

  const handleOAuthSignIn = async () => {
    if (!siLoaded || !suLoaded) return
    setIsGoogleLoading(true)
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-in",
        redirectUrlComplete: "/chat",
      })
    } catch (err: any) {
      if (err?.errors?.[0]?.code === "identifier_not_found") {
        await signUp.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: "/sign-up",
          redirectUrlComplete: "/chat",
        })
      } else {
        console.error(err)
      }
    } finally {
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-4 h-4 bg-sage-300/20 rounded-full animate-pulse"></div>
        <div className="absolute top-32 right-20 w-3 h-3 bg-clay-400/20 rounded-full animate-pulse delay-1000"></div>
        <div className="absolute bottom-40 left-20 w-5 h-5 bg-sage-300/20 rounded-full animate-pulse delay-2000"></div>
        <div className="absolute bottom-20 right-32 w-2 h-2 bg-clay-400/20 rounded-full animate-pulse delay-3000"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-sand-50/70 backdrop-blur-lg rounded-3xl p-10 shadow-soft border border-white/20">
          <div className="text-center mb-8">
            <motion.h1
              className="font-display text-3xl font-bold text-sage-500 mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Welcome back 👋
            </motion.h1>
            <motion.p
              className="text-sage-400 font-sans text-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              Slurpy is designed to support, not judge.
            </motion.p>
          </div>

          <motion.div
            className="space-y-3 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Button
              onClick={handleOAuthSignIn}
              disabled={isGoogleLoading || isFormLoading}
              variant="outline"
              className="w-full flex items-center justify-center gap-3 rounded-xl border-sand-200 bg-white/50 hover:bg-sage-100 py-6 font-sans font-medium text-sage-600 transition-all duration-200 disabled:opacity-50"
            >
              {isGoogleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Chrome className="h-5 w-5" />}
              Continue with Google
            </Button>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
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
                  disabled={isGoogleLoading || isFormLoading}
                  className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                  placeholder="you@example.com"
                />
              </div>
            </div>

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
                  disabled={isGoogleLoading || isFormLoading}
                  className="pl-10 pr-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isGoogleLoading || isFormLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sage-400 hover:text-sage-600 disabled:opacity-50"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
              <Button
                type="submit"
                disabled={
                  !formData.email || !formData.password || isGoogleLoading || isFormLoading
                }
                className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFormLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
                  </span>
                ) : (
                  "Sign in"
                )}
              </Button>
            </motion.div>
          </motion.form>

          <motion.div
            className="text-center mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <p className="text-sage-400 font-sans text-sm">
              {"Don't have an account? "}
              <Link
                href="/sign-up"
                className="text-sage-500 hover:text-sage-600 font-medium underline underline-offset-2"
              >
                Sign up
              </Link>
            </p>
          </motion.div>

          <motion.div
            className="text-center mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            <Link
              href="/forgot-password"
              className="text-sage-400 hover:text-sage-500 font-sans text-sm underline underline-offset-2"
            >
              Forgot your password?
            </Link>
          </motion.div>
        </div>

        <motion.div
          className="text-center mt-6 px-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1 }}
        >
          <p className="text-sage-400 font-sans text-xs leading-relaxed">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-sage-500">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-sage-500">
              Privacy Policy
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
