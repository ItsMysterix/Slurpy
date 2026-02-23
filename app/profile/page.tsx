"use client"

export const dynamic = "force-dynamic"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft, User, Bell, Trash2, Lock, CheckCircle,
  Sun, Moon, Monitor, ImagePlus, Loader2
} from "lucide-react"
import { useTheme } from "next-themes"
import { useUser, useAuthClient, useReverification } from "@/lib/auth-hooks"
import { supabase } from "@/lib/supabaseClient"
import { MemoryManager } from "@/components/memory/MemoryManager"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

export default function ProfilePage() {
  const router = useRouter()

  /* ---------------- Theme ---------------- */
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  /* ---------------- Auth ---------------- */
  const { user, isLoaded } = useUser()
  const { signOut } = useAuthClient()

  /* ---------------- State ---------------- */
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [lastUsernameUpdate, setLastUsernameUpdate] = useState<Date | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [dataSharing, setDataSharing] = useState(false)
  const [surveyOptOut, setSurveyOptOut] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  /* ---------------- Redirect if signed-out ---------------- */
  useEffect(() => {
    if (isLoaded && !user) router.push("/")
  }, [isLoaded, user, router])

  /* ---------------- Hydrate fields ---------------- */
  useEffect(() => {
    if (!user) return
    const um = (user as any).user_metadata || {}
    const displayName = um.username || um.name || [um.given_name, um.family_name].filter(Boolean).join(" ") || ""
    setName(displayName)
    setEmail((user as any).email || "")
    setUsername(um.username || "")
    if (um.lastUsernameUpdate) setLastUsernameUpdate(new Date(um.lastUsernameUpdate))
    // Initialize avatar preview from metadata to show current image
    const currentAvatar = um.avatar_url || um.picture || null
    if (currentAvatar) setAvatarPreview(currentAvatar)
  }, [user])

  /* ---------------- Username cooldown ---------------- */
  const canChangeUsername = useCallback(() => {
    if (!lastUsernameUpdate) return true
    const daysSince = (Date.now() - lastUsernameUpdate.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince >= 7
  }, [lastUsernameUpdate])

  /* ---------------- Username update (with step-up) ---------------- */
  const doSaveUsername = async () => {
    if (!username.trim() || !user) return
    if (!canChangeUsername()) {
      alert("You can only change your username once every 7 days.")
      return
    }
    setIsLoading(true)
    try {
      await supabase.auth.updateUser({ data: { username, lastUsernameUpdate: new Date().toISOString() } })
      setLastUsernameUpdate(new Date())
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (error) {
      console.error("Failed to update username", error)
      alert("Update failed. Try again.")
    } finally {
      setIsLoading(false)
    }
  }
  const saveUsername = useReverification(doSaveUsername)

  /* ---------------- Avatar ---------------- */
  const onAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setAvatarFile(f)
    const url = URL.createObjectURL(f)
    setAvatarPreview(url)
  }

  const saveAvatar = async () => {
    if (!user || !avatarFile) return
    setAvatarUploading(true)
    try {
      const uid = (user as any).id
      const path = `${uid}/avatar_${Date.now()}`
      const { data: up, error: upErr } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(up.path)
      await supabase.auth.updateUser({ data: { avatar_url: pub.publicUrl } })
      setAvatarFile(null)
      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview)
      }
      setAvatarPreview(pub.publicUrl)
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (err) {
      console.error("Failed to upload profile image:", err)
      alert("Failed to update profile image. Try again.")
    } finally {
      setAvatarUploading(false)
    }
  }

  const identities = (user as any)?.identities as Array<{ provider: string }> | undefined
  const hasGoogle = !!identities?.some((i) => i.provider === "google")
  const linkGoogle = async () => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: `${origin}/sso-callback?next=/profile` } })
    } catch (e) {
      alert("Failed to start Google linking. Try again.")
    }
  }

  /* ---------------- Delete account flow ----------------
    1) POST /api/purge-user  (Supabase + Qdrant)
    2) POST /api/account/delete (server-side deletion in auth provider)
    3) signOut -> redirect "/"
  ------------------------------------------------------ */
  const doDeleteAccount = async () => {
    if (!isLoaded || !user) {
      alert("Please wait, still loading your account.")
      return
    }
    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This action cannot be undone."
    )
    if (!confirmed) return

    setIsDeleting(true)
    try {
      // 1) Purge app data first (so the route can still read user session)
      try {
        const purge = await fetch("/api/purge-user", { method: "POST", cache: "no-store" })
        if (!purge.ok) {
          const txt = await purge.text().catch(() => "")
          console.warn("Purge returned non-OK:", purge.status, txt)
        }
      } catch (e) {
        console.warn("Purge request failed. Continuing with account deletion.", e)
      }

      // 2) Ask server to delete with admin key (make sure /api/account/delete exists)
      const resp = await fetch("/api/account/delete", { method: "POST" })
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "")
        throw new Error(`Server delete failed (${resp.status}): ${txt}`)
      }

      // 3) Ensure local session is cleared and redirect home
      await signOut({ redirectUrl: "/" })
    } catch (err) {
      console.error("Account deletion failed:", err)
      alert("Account deletion failed. Please try again.")
      setIsDeleting(false)
    }
  }

  // Wrap destructive action with re-verification if needed (placeholder shim)
  const deleteAccount = useReverification(doDeleteAccount)

  /* ---------------- Password stubs (optional UI) ---------------- */
  const handlePasswordReset = async () => {
    setIsPasswordLoading(true)
    try {
      await new Promise((r) => setTimeout(r, 1500))
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } finally {
      setIsPasswordLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert("New passwords don't match")
      return
    }
    if (!passwordForm.currentPassword || !passwordForm.newPassword) return
    setIsPasswordLoading(true)
    try {
      await new Promise((r) => setTimeout(r, 2000))
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
      setShowPasswordForm(false)
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
    } finally {
      setIsPasswordLoading(false)
    }
  }

  /* ---------------- Theme toggle ---------------- */
  const ThemeToggle = () => {
    if (!mounted) return null
    const icon = theme === "light" ? <Sun className="w-4 h-4" /> : theme === "dark" ? <Moon className="w-4 h-4" /> : <Monitor className="w-4 h-4" />
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light"
    const label = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="font-sans font-medium text-clay-700 dark:text-sand-200">Theme</p>
            <p className="text-sm text-clay-500 dark:text-sand-400 font-sans">Current: {label}</p>
          </div>
        </div>
        <Button
          onClick={() => setTheme(next)}
          variant="outline"
          size="sm"
          className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 hover:bg-sage-100 dark:hover:bg-gray-600 text-clay-600 dark:text-sand-300 font-sans backdrop-blur-sm transition-all duration-200"
        >
          {icon}
          <span className="ml-2">{label}</span>
        </Button>
      </div>
    )
  }

  /* ---------------- Loading gates ---------------- */
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sage-500" />
      </div>
    )
  }
  if (!user) return null

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500 flex justify-center py-12 px-4">
      {/* Success Toast */}
      {showSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-4 right-4 z-50 bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 dark:from-sage-600 dark:via-clay-600 dark:to-sand-600 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 backdrop-blur-sm"
          aria-live="polite"
        >
          <CheckCircle className="w-4 h-4" />
          <span className="font-sans text-sm">Success!</span>
        </motion.div>
      )}

      <div className="max-w-xl w-full space-y-10 bg-gradient-to-r from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg rounded-3xl shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)] border border-sage-100/30 dark:border-gray-700/30 p-8 sm:p-10">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/chat">
            <Button variant="ghost" size="sm" className="text-clay-500 hover:text-clay-600 dark:text-sand-400 dark:hover:text-sand-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="font-display text-clay-700 dark:text-sand-200 text-2xl">Profile</h1>
        </div>

        {/* Profile Details */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Card className="bg-gradient-to-br from-white/50 via-sage-50/30 to-sand-50/50 dark:from-gray-800/50 dark:via-gray-700/30 dark:to-gray-800/50 border-sage-200/50 dark:border-gray-600/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-sage-400 via-clay-400 to-sand-400 dark:from-sage-500 dark:via-clay-500 dark:to-sand-500 flex items-center justify-center shadow-lg">
                    {avatarPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarPreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-8 h-8 text-white" />
                    )}
                  </div>

                  <label
                    htmlFor="avatar"
                    className="absolute -bottom-2 -right-2 cursor-pointer rounded-full bg-white/80 dark:bg-gray-800/80 border border-sage-200 dark:border-gray-700 p-1.5 shadow-sm"
                    title="Change profile photo"
                  >
                    <ImagePlus className="w-4 h-4 text-clay-600 dark:text-sand-300" />
                    <input id="avatar" type="file" accept="image/*" className="hidden" onChange={onAvatarFileChange} />
                  </label>
                </div>

                <div>
                  <h3 className="font-display text-clay-700 dark:text-sand-200 text-lg">Your Profile</h3>
                  <p className="text-clay-500 dark:text-sand-400 text-sm font-sans">Manage your account settings</p>
                </div>
              </div>

              {avatarPreview && (
                <div className="flex gap-2 mb-6">
                  <Button onClick={saveAvatar} disabled={avatarUploading} className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white rounded-xl">
                    {avatarUploading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>) : "Save Photo"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
                      setAvatarPreview(null)
                      setAvatarFile(null)
                    }}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                </div>
              )}

              <div className="space-y-4">
                {/* Username */}
                <div>
                  <Label htmlFor="username" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={!canChangeUsername()}
                    className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 font-sans text-clay-700 dark:text-sand-100 backdrop-blur-sm"
                    placeholder="Choose your username"
                  />
                  {!canChangeUsername() && (
                    <p className="text-xs text-red-500 mt-1">You can only change your username once every 7 days.</p>
                  )}
                  <Button
                    onClick={saveUsername}
                    disabled={isLoading}
                    className="mt-3 w-full bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 dark:from-sage-600 dark:via-clay-600 dark:to-sand-600 dark:hover:from-sage-700 dark:hover:via-clay-700 dark:hover:to-sand-700 text-white rounded-xl py-2 font-sans font-medium transition-all duration-200 disabled:opacity-50 shadow-md"
                  >
                    {isLoading ? "Saving..." : "Save Username"}
                  </Button>
                </div>

                {/* Full Name (read-only) */}
                <div>
                  <Label htmlFor="name" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">Full Name</Label>
                  <Input id="name" value={name} readOnly disabled className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-gray-100/70 dark:bg-gray-700/60 font-sans text-clay-700 dark:text-sand-100 cursor-not-allowed" placeholder="Your full name" />
                </div>

                {/* Email (read-only) */}
                <div>
                  <Label htmlFor="email" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">Email Address</Label>
                  <Input id="email" value={email} readOnly disabled className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-gray-100/70 dark:bg-gray-700/60 font-sans text-clay-700 dark:text-sand-100 cursor-not-allowed" placeholder="Your email address" type="email" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
          <h2 className="font-display text-clay-700 dark:text-sand-200 text-xl mb-4">Security</h2>
          <Card className="bg-gradient-to-br from-white/50 via-sage-50/30 to-sand-50/50 dark:from-gray-800/50 dark:via-gray-700/30 dark:to-gray-800/50 border-sage-200/50 dark:border-gray-600/50 backdrop-blur-sm">
            <CardContent className="p-6">
              {/* Linked accounts */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.106,6.053,28.805,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.817C14.655,16.108,19.01,13,24,13c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C33.106,6.053,28.805,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                    <path fill="#4CAF50" d="M24,44c4.717,0,8.998-1.802,12.25-4.75l-5.657-5.657C28.614,35.091,26.387,36,24,36 c-5.202,0-9.619-3.33-11.274-7.967l-6.535,5.036C9.592,39.556,16.262,44,24,44z"/>
                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.188-4.123,5.657l0.003-0.002l6.535,5.036 C35.928,39.556,42.598,44,24,44c7.732,0,17-6.268,17-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                  </svg>
                  <div>
                    <p className="font-sans font-medium text-clay-700 dark:text-sand-200">Google</p>
                    <p className="text-sm text-clay-500 dark:text-sand-400 font-sans">{hasGoogle ? "Linked" : "Not linked"}</p>
                  </div>
                </div>
                {!hasGoogle && (
                  <Button onClick={linkGoogle} variant="outline" className="rounded-xl">Link Google</Button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-sage-500 dark:text-sand-400" />
                  <div>
                    <p className="font-sans font-medium text-clay-700 dark:text-sand-200">Password</p>
                    <p className="text-sm text-clay-500 dark:text-sand-400 font-sans">Change your account password</p>
                  </div>
                </div>
                <Button
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                  variant="outline"
                  className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 hover:bg-sage-100 dark:hover:bg-gray-600 text-clay-600 dark:text-sand-300 font-sans backdrop-blur-sm"
                >
                  {showPasswordForm ? "Cancel" : "Change Password"}
                </Button>
              </div>

              {showPasswordForm && (
                <motion.form
                  onSubmit={handlePasswordChange}
                  className="mt-4 space-y-4 p-4 bg-gradient-to-br from-sand-50/60 via-white/40 to-sage-50/60 dark:from-gray-700/60 dark:via-gray-600/40 dark:to-gray-700/60 rounded-xl border border-sage-200/50 dark:border-gray-600/50 backdrop-blur-sm"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div>
                    <Label htmlFor="currentPassword" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium my-0 py-0.5">
                      Current Password
                    </Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                      disabled={isPasswordLoading}
                      className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 font-sans disabled:opacity-50 text-clay-700 dark:text-sand-100 backdrop-blur-sm"
                      placeholder="Enter current password"
                    />
                  </div>

                  <div>
                    <Label htmlFor="newPassword" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">
                      New Password
                    </Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                      disabled={isPasswordLoading}
                      className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 font-sans disabled:opacity-50 text-clay-700 dark:text-sand-100 backdrop-blur-sm"
                      placeholder="Enter new password"
                    />
                  </div>

                  <div>
                    <Label htmlFor="confirmPassword" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">
                      Confirm New Password
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      disabled={isPasswordLoading}
                      className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 font-sans disabled:opacity-50 text-clay-700 dark:text-sand-100 backdrop-blur-sm"
                      placeholder="Confirm new password"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={
                      isPasswordLoading ||
                      !passwordForm.currentPassword ||
                      !passwordForm.newPassword ||
                      !passwordForm.confirmPassword
                    }
                    className="w-full bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 dark:from-sage-600 dark:via-clay-600 dark:to-sand-600 dark:hover:from-sage-700 dark:hover:via-clay-700 dark:hover:to-sand-700 text-white rounded-xl py-2 font-sans font-medium transition-all duration-200 disabled:opacity-50 shadow-md"
                  >
                    {isPasswordLoading ? "Changing Password..." : "Change Password"}
                  </Button>

                  <div className="pt-2">
                    <Button type="button" variant="ghost" onClick={handlePasswordReset} disabled={isPasswordLoading} className="text-sm">
                      {isPasswordLoading ? "Sending reset…" : "Send password reset email"}
                    </Button>
                  </div>
                </motion.form>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Memory Manager */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
          <MemoryManager />
        </motion.div>

        {/* Settings / Danger Zone */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
          <h2 className="font-display text-clay-700 dark:text-sand-200 text-xl mb-4">Settings</h2>
          <Card className="bg-gradient-to-br from-white/50 via-sage-50/30 to-sand-50/50 dark:from-gray-800/50 dark:via-gray-700/30 dark:to-gray-800/50 border-sage-200/50 dark:border-gray-600/50 backdrop-blur-sm">
            <CardContent className="p-6 space-y-6">
              <ThemeToggle />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-sage-500 dark:text-sand-400" />
                  <div>
                    <p className="font-sans font-medium text-clay-700 dark:text-sand-200">Notifications</p>
                    <p className="text-sm text-clay-500 dark:text-sand-400 font-sans">Receive updates and reminders</p>
                  </div>
                </div>
                <Switch
                  checked={notifications}
                  onCheckedChange={setNotifications}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-sage-500 data-[state=checked]:to-clay-500 dark:data-[state=checked]:from-sage-600 dark:data-[state=checked]:to-clay-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-sage-500 dark:text-sand-400" />
                  <div>
                    <p className="font-sans font-medium text-clay-700 dark:text-sand-200">Share anonymous data</p>
                    <p className="text-sm text-clay-500 dark:text-sand-400 font-sans">Help us improve by sharing usage metrics.</p>
                  </div>
                </div>
                <Switch
                  checked={dataSharing}
                  onCheckedChange={setDataSharing}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-sage-500 data-[state=checked]:to-clay-500 dark:data-[state=checked]:from-sage-600 dark:data-[state=checked]:to-clay-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-sage-500 dark:text-sand-400" />
                  <div>
                    <p className="font-sans font-medium text-clay-700 dark:text-sand-200">Wellness Surveys</p>
                    <p className="text-sm text-clay-500 dark:text-sand-400 font-sans">Opt out of periodic mental health check-ins</p>
                  </div>
                </div>
                <Switch
                  checked={surveyOptOut}
                  onCheckedChange={setSurveyOptOut}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-sage-500 data-[state=checked]:to-clay-500 dark:data-[state=checked]:from-sage-600 dark:data-[state=checked]:to-clay-600"
                />
              </div>

              {/* Danger Zone */}
              <div className="pt-2">
                <Button
                  onClick={deleteAccount} // step-up + purge + delete + fallback
                  variant="destructive"
                  disabled={isDeleting || !isLoaded}
                  className="w-full justify-center font-sans text-white bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 rounded-xl shadow-md disabled:opacity-60"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting Account...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Account
                    </>
                  )}
                </Button>
                <p className="text-xs text-red-500 dark:text-red-400 mt-2 font-sans">
                  This action cannot be undone. All your data will be permanently deleted.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Footer */}
        <motion.div className="text-center pt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.6 }}>
          <p className="text-clay-500 dark:text-sand-400 font-sans text-xs">
            Need help? Contact us at{" "}
            <a href="mailto:support@slurpy.ai" className="underline hover:text-clay-600 dark:hover:text-sand-300 transition-colors">
              support@slurpy.ai
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
