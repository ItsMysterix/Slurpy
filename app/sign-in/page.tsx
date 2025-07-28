"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Chrome, Mail, Lock, Eye, EyeOff, Loader2, User } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSignIn, useAuth } from "@clerk/nextjs"
import { useTheme } from "next-themes"

export default function SignInPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { isLoaded, signIn, setActive } = useSignIn()
  const { setTheme, theme } = useTheme()

  const [showPassword, setShowPassword] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isFormLoading, setIsFormLoading] = useState(false)
  const [formData, setFormData] = useState({ identifier: "", password: "" })

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

  // Handle successful authentication
  useEffect(() => {
    console.log("Auth state changed:", { isSignedIn, isLoaded })
    if (isSignedIn) {
      console.log("User authenticated, redirecting to /chat")
      router.push("/chat")
    }
  }, [isSignedIn, router])

  // Debug all Clerk state changes
  useEffect(() => {
    if (isLoaded && signIn) {
      console.log("=== CLERK DEBUG INFO ===")
      console.log("SignIn loaded:", isLoaded)
      console.log("SignIn status:", signIn.status)
      console.log("Is signed in:", isSignedIn)
      console.log("Current URL:", window.location.href)
      console.log("========================")
    }
  }, [isLoaded, signIn, isSignedIn])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }))

  const isEmail = (str: string) => str.includes('@') && str.includes('.')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !formData.identifier || !formData.password) return
    
    setIsFormLoading(true)
    console.log("Attempting form sign in")
    
    try {
      const result = await signIn.create({
        identifier: formData.identifier,
        password: formData.password,
      })
      
      console.log("Sign in result:", result.status)
      
      if (result.status === "complete") {
        console.log("Form sign in successful")
        await setActive({ session: result.createdSessionId })
        router.push("/chat")
      }
    } catch (err: any) {
      console.error("Sign in error:", err)
      const errorCode = err?.errors?.[0]?.code
      
      if (errorCode === "form_identifier_not_found") {
        alert("Account not found. Please check your credentials or sign up.")
      } else if (errorCode === "form_password_incorrect") {
        alert("Incorrect password. Please try again.")
      } else {
        alert("Invalid credentials. Please try again.")
      }
    } finally {
      setIsFormLoading(false)
    }
  }

  const handleOAuthSignIn = async () => {
    if (!isLoaded) return
    
    setIsGoogleLoading(true)
    console.log("Starting Google OAuth")
    
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-in",
        redirectUrlComplete: "/chat",
      })
    } catch (err: any) {
      console.error("Google OAuth error:", err)
      setIsGoogleLoading(false)
      
      if (!err.message?.includes("redirect")) {
        alert("Google authentication failed. Please try again.")
      }
    }
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sage-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-sand-50/70 backdrop-blur-lg rounded-3xl p-10 shadow-soft border border-white/20">
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl font-bold text-sage-500 mb-2">
              Welcome back 👋
            </h1>
            <p className="text-sage-400 font-sans text-sm">
              Slurpy is designed to support, not judge.
            </p>
          </div>

          <div className="space-y-3 mb-8">
            <Button
              onClick={handleOAuthSignIn}
              disabled={isGoogleLoading || isFormLoading}
              variant="outline"
              className="w-full flex items-center justify-center gap-3 rounded-xl border-sand-200 bg-white/50 hover:bg-sage-100 py-6 font-sans font-medium text-sage-600 transition-all duration-200 disabled:opacity-50"
            >
              {isGoogleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Chrome className="h-5 w-5" />}
              Continue with Google
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-sand-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-sand-50/70 px-2 text-sage-400">Or continue with</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-sage-600 font-sans text-sm font-medium">
                Email or Username
              </Label>
              <div className="relative">
                {isEmail(formData.identifier) ? (
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                ) : (
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                )}
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  value={formData.identifier}
                  onChange={handleInputChange}
                  disabled={isGoogleLoading || isFormLoading}
                  className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                  placeholder="you@example.com or username"
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

            <Button
              type="submit"
              disabled={!formData.identifier || !formData.password || isGoogleLoading || isFormLoading}
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
          </form>

          <div className="text-center mt-6">
            <p className="text-sage-400 font-sans text-sm">
              {"Don't have an account? "}
              <Link
                href="/sign-up"
                className="text-sage-500 hover:text-sage-600 font-medium underline underline-offset-2"
              >
                Sign up
              </Link>
            </p>
          </div>

          <div className="text-center mt-4">
            <Link
              href="/forgot-password"
              className="text-sage-400 hover:text-sage-500 font-sans text-sm underline underline-offset-2"
            >
              Forgot your password?
            </Link>
          </div>
        </div>

        <div className="text-center mt-6 px-4">
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
        </div>
      </div>
    </div>
  )
}