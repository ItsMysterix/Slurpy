"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Chrome, Mail, Lock, User, Eye, EyeOff, Loader2, AtSign } from "lucide-react"
import { useSignUp, useAuth } from "@clerk/nextjs"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SignUpPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { isLoaded, signUp, setActive } = useSignUp()
  const { setTheme, theme } = useTheme()

  const [showPassword, setShowPassword] = React.useState(false)
  const [isLoadingForm, setIsLoadingForm] = React.useState(false)
  const [isLoadingOAuth, setIsLoadingOAuth] = React.useState(false)
  const [errMsg, setErrMsg] = React.useState<string | null>(null)

  const [formData, setFormData] = React.useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
  })

  // Force light theme on auth screens
  React.useEffect(() => {
    const prev = theme
    setTheme("light")
    return () => {
      if (prev && prev !== "light") setTheme(prev)
    }
  }, [setTheme, theme])

  // If already authenticated, go to chat
  React.useEffect(() => {
    if (isSignedIn) router.push("/chat")
  }, [isSignedIn, router])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(p => ({ ...p, [e.target.name]: e.target.value }))
    setErrMsg(null)
  }

  const isFormValid =
    formData.firstName &&
    formData.lastName &&
    formData.username &&
    formData.email &&
    formData.password

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrMsg(null)

    if (!isLoaded || !signUp || !isFormValid) return

    setIsLoadingForm(true)
    try {
      // 1) Create the sign-up
      const result = await signUp.create({
        firstName: formData.firstName,
        lastName: formData.lastName,
        username: formData.username,        // allowed because you enabled username sign-up
        emailAddress: formData.email,
        password: formData.password,
      })

      // 2) If Clerk finished immediately (rare), activate and go
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        router.push("/chat")
        return
      }

      // 3) Otherwise, start email-code verification **on the signUp instance**
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" })

      // 4) Route to OTP screen (pass email for UX)
      router.push(`/email-verify-page?email=${encodeURIComponent(formData.email)}`)
    } catch (err: any) {
      const code = err?.errors?.[0]?.code
      const message = err?.errors?.[0]?.message || "Something went wrong. Please try again."

      // Helpful messages for common cases
      if (code === "form_identifier_exists") {
        setErrMsg("This email or username is already in use. Try signing in.")
      } else if (code === "weak_password") {
        setErrMsg("That password is too weak. Please choose a stronger one.")
      } else if (code === "invalid_username") {
        setErrMsg("Please choose a different username.")
      } else {
        setErrMsg(message)
      }
    } finally {
      setIsLoadingForm(false)
    }
  }

  const handleOAuthSignUp = async () => {
    if (!isLoaded || !signUp) return
    setIsLoadingOAuth(true)
    setErrMsg(null)
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/chat",
      })
    } catch (err: any) {
      setErrMsg("Google sign-up failed. Please try again.")
      setIsLoadingOAuth(false)
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
            <h1 className="font-display text-3xl font-bold text-sage-500 mb-2">Join Slurpy 🌱</h1>
            <p className="text-sage-400 font-sans text-sm">Slurpy is designed to support, not judge.</p>
          </div>

          <div className="space-y-3 mb-8">
            <Button
              onClick={handleOAuthSignUp}
              disabled={isLoadingOAuth || isLoadingForm}
              variant="outline"
              className="w-full flex items-center justify-center gap-3 rounded-xl border-sand-200 bg-white/50 hover:bg-sage-100 py-6 font-sans font-medium text-sage-600 transition-all duration-200 disabled:opacity-50"
            >
              {isLoadingOAuth ? <Loader2 className="h-5 w-5 animate-spin" /> : <Chrome className="h-5 w-5" />}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sage-600 font-sans text-sm font-medium">First name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                  <Input id="firstName" name="firstName" type="text" value={formData.firstName} onChange={onChange}
                    disabled={isLoadingForm || isLoadingOAuth}
                    className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sage-600 font-sans text-sm font-medium">Last name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                  <Input id="lastName" name="lastName" type="text" value={formData.lastName} onChange={onChange}
                    disabled={isLoadingForm || isLoadingOAuth}
                    className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-sage-600 font-sans text-sm font-medium">Username</Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input id="username" name="username" type="text" value={formData.username} onChange={onChange}
                  disabled={isLoadingForm || isLoadingOAuth}
                  className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                  placeholder="johndoe" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sage-600 font-sans text-sm font-medium">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input id="email" name="email" type="email" value={formData.email} onChange={onChange}
                  disabled={isLoadingForm || isLoadingOAuth}
                  className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                  placeholder="you@example.com" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sage-600 font-sans text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input id="password" name="password" type={showPassword ? "text" : "password"}
                  value={formData.password} onChange={onChange}
                  disabled={isLoadingForm || isLoadingOAuth}
                  className="pl-10 pr-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans disabled:opacity-50"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(v => !v)} disabled={isLoadingForm || isLoadingOAuth}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sage-400 hover:text-sage-600 disabled:opacity-50">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errMsg && <p className="text-sm text-red-500">{errMsg}</p>}

            <Button type="submit" disabled={!isFormValid || isLoadingForm || isLoadingOAuth}
              className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200 mt-4 disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoadingForm ? (<span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</span>) : "Create account"}
            </Button>
          </form>

          <div className="text-center mt-6">
            <p className="text-sage-400 font-sans text-sm">
              Already have an account?{" "}
              <Link href="/sign-in" className="text-sage-500 hover:text-sage-600 font-medium underline underline-offset-2">Sign in</Link>
            </p>
          </div>
        </div>

        <div className="text-center mt-6 px-4">
          <p className="text-sage-400 font-sans text-xs leading-relaxed">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-sage-500">Terms of Service</Link> and{" "}
            <Link href="/privacy" className="underline hover:text-sage-500">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
