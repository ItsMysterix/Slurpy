"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, Lock, Eye, EyeOff, Loader2, User } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSignIn, useAuth } from "@/lib/auth-hooks"
import { useTheme } from "next-themes"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export default function SignInPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { isLoaded, signIn, setActive } = useSignIn()
  const { setTheme, theme } = useTheme()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""

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

  // Debug all auth state changes
  useEffect(() => {
    if (isLoaded && signIn) {
      console.log("=== AUTH DEBUG INFO ===")
      console.log("SignIn loaded:", isLoaded)
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
      // Trim only the identifier to avoid whitespace issues; never trim the password.
      const identifier = formData.identifier.trim()
      const result = await signIn.create({
        identifier,
        password: formData.password,
      })
      
      console.log("Sign in result:", result.status)
      
      if (result.status === "complete") {
        console.log("Form sign in successful")
        await setActive({ session: result.createdSessionId })
        router.push("/chat")
        return
      }

  // Handle other flows explicitly (e.g., 2FA)
      if ((result as any)?.status === "needs_second_factor") {
        alert("Two-factor authentication is required. Please complete the verification step in your account.")
        return
      }
    } catch (err: any) {
      console.error("Sign in error:", err)
      const errorCode = err?.errors?.[0]?.code as string | undefined
      const message = err?.errors?.[0]?.message as string | undefined
      const identifier = formData.identifier.trim()

      switch (errorCode) {
        case "form_identifier_not_found":
        case "identifier_not_found":
          alert("We couldn't find an account with those details. Please check your email/username or sign up.")
          break
        case "form_password_incorrect":
          alert("Incorrect password. You can try again or reset your password.")
          break
        // Some users created via Google/OAuth don't have a password yet.
  // The provider may return one of these codes/messages — redirect to set a password.
        case "form_password_not_set":
        case "password_not_set":
          router.push(`/forgot-password?email=${encodeURIComponent(identifier)}`)
          break
        case "throttled":
        case "too_many_requests":
          alert("Too many attempts. Please wait a moment and try again.")
          break
        default:
          // If the provider hints that a password isn't set via message text
          if (message && /password (has not|is not) set/i.test(message)) {
            router.push(`/forgot-password?email=${encodeURIComponent(identifier)}`)
          } else {
            alert(message || "Invalid credentials. Please try again.")
          }
      }
    } finally {
      setIsFormLoading(false)
    }
  }

  // Google OAuth
  const handleGoogle = async () => {
    try {
      setIsGoogleLoading(true)
      const origin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || ""
      await signIn.authenticateWithRedirect({ strategy: "oauth_google", redirectUrlComplete: `${origin}/sso-callback` })
    } catch (e) {
      console.error("Google sign-in failed", e)
      setIsGoogleLoading(false)
      alert("Google sign-in failed. Please try again or use email/password.")
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
          {/* Runtime guard for Supabase config */}
          {!supabaseUrl && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 p-3 text-sm">
              Authentication isn’t fully configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
            </div>
          )}
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl font-bold text-sage-500 mb-2">
              Welcome back 👋
            </h1>
            <p className="text-sage-400 font-sans text-sm">
              Slurpy is designed to support, not judge.
            </p>
          </div>

          {/* OAuth */}
          <div className="grid gap-3 mb-6">
            <Button type="button" variant="outline" disabled={isGoogleLoading || isFormLoading} onClick={handleGoogle}
              className="w-full rounded-xl py-6 font-sans">
              {isGoogleLoading ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.106,6.053,28.805,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.817C14.655,16.108,19.01,13,24,13c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C33.106,6.053,28.805,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c4.717,0,8.998-1.802,12.25-4.75l-5.657-5.657C28.614,35.091,26.387,36,24,36 c-5.202,0-9.619-3.33-11.274-7.967l-6.535,5.036C9.592,39.556,16.262,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.188-4.123,5.657l0.003-0.002l6.535,5.036 C35.928,39.556,42.598,44,24,44c7.732,0,17-6.268,17-20C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                  Continue with Google
                </span>
              )}
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