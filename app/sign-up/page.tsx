"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Mail, Lock, User, Eye, EyeOff, Loader2, AtSign } from "lucide-react"
import { useSignUp, useAuth } from "@/lib/auth-hooks"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabaseClient"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export default function SignUpPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { isLoaded, signUp, setActive } = useSignUp()
  const { setTheme, theme } = useTheme()

  const [showPassword, setShowPassword] = React.useState(false)
  const [isLoadingForm, setIsLoadingForm] = React.useState(false)
  const [isLoadingOAuth, setIsLoadingOAuth] = React.useState(false)
  const [errMsg, setErrMsg] = React.useState<string | null>(null)
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null)

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

  const onAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setAvatarFile(f)
    setAvatarPreview(URL.createObjectURL(f))
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
      // Stash avatar for upload after verification if needed
      if (avatarFile) {
        try {
          const buf = await avatarFile.arrayBuffer()
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
          const pending = {
            name: avatarFile.name,
            type: avatarFile.type,
            b64,
          }
          localStorage.setItem("slurpy_pending_avatar", JSON.stringify(pending))
        } catch {}
      }
      // 1) Create the sign-up
      const result = await signUp.create({
        firstName: formData.firstName,
        lastName: formData.lastName,
        username: formData.username,        // allowed because you enabled username sign-up
        emailAddress: formData.email,
        password: formData.password,
      })

  // 2) If the provider finished immediately (rare), activate and go
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        // If we already have a session, try to upload avatar now
        try {
          const pendingRaw = localStorage.getItem("slurpy_pending_avatar")
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw) as { name: string; type: string; b64: string }
            const res = await supabase.auth.getUser()
            const uid = res.data.user?.id
            if (uid) {
              const bytes = Uint8Array.from(atob(pending.b64), c => c.charCodeAt(0))
              const filePath = `${uid}/avatar_${Date.now()}`
              const { data: up, error: upErr } = await supabase.storage.from("avatars").upload(filePath, bytes, { contentType: pending.type, upsert: true })
              if (!upErr) {
                const { data: pub } = supabase.storage.from("avatars").getPublicUrl(up.path)
                await supabase.auth.updateUser({ data: { avatar_url: pub.publicUrl } })
              }
            }
            localStorage.removeItem("slurpy_pending_avatar")
          }
        } catch {}
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

  // Google OAuth
  const handleGoogle = async () => {
    try {
      setIsLoadingOAuth(true)
      const origin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || ""
      await signUp.authenticateWithRedirect({ strategy: "oauth_google", redirectUrlComplete: `${origin}/sso-callback` })
    } catch (e) {
      console.error("Google sign-up failed", e)
      setIsLoadingOAuth(false)
      setErrMsg("Google sign-up failed. Please try again or use email/password.")
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

          {/* OAuth */}
          <div className="grid gap-3 mb-6">
            <Button type="button" variant="outline" disabled={isLoadingForm || isLoadingOAuth} onClick={handleGoogle}
              className="w-full rounded-xl py-6 font-sans">
              {isLoadingOAuth ? (
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
            {/* Optional avatar */}
            <div className="space-y-2">
              <Label htmlFor="avatar" className="text-sage-600 font-sans text-sm font-medium">Profile picture (optional)</Label>
              <input id="avatar" type="file" accept="image/*" onChange={onAvatarChange} />
              {avatarPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="preview" className="mt-2 w-16 h-16 rounded-full object-cover" />
              )}
            </div>
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
