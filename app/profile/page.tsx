"use client"

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
import { useUser, useClerk, useReverification } from "@clerk/nextjs"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

export default function ProfilePage() {
  const router = useRouter()
  
  // Theme
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Clerk
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()

  // Profile state
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [lastUsernameUpdate, setLastUsernameUpdate] = useState<Date | null>(null)

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [dataSharing, setDataSharing] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  // Avatar upload
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Prevent hydration mismatch for theme
  useEffect(() => {
    setMounted(true)
  }, [])

  // Redirect if user is not loaded or doesn't exist
  useEffect(() => {
    if (isLoaded && !user) {
      console.log("User not found, redirecting to landing page")
      router.push("/")
    }
  }, [isLoaded, user, router])

  // Hydrate fields from Clerk
  useEffect(() => {
    if (!user) return
    setName(user.fullName || "")
    setEmail(user.primaryEmailAddress?.emailAddress || "")
    setUsername(user.username || "")
    // Read last username change timestamp from unsafeMetadata
    const meta = user.unsafeMetadata as Record<string, unknown>
    if (meta?.lastUsernameUpdate && typeof meta.lastUsernameUpdate === "string") {
      setLastUsernameUpdate(new Date(meta.lastUsernameUpdate))
    }
  }, [user])

  // Only allow username change every 7 days
  const canChangeUsername = useCallback(() => {
    if (!lastUsernameUpdate) return true
    const daysSince =
      (Date.now() - lastUsernameUpdate.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince >= 7
  }, [lastUsernameUpdate])

  // -------- USERNAME UPDATE (with step-up via useReverification) --------
  const doSaveUsername = async () => {
    if (!username.trim() || !user) return
    if (!canChangeUsername()) {
      alert("You can only change your username once every 7 days.")
      return
    }

    setIsLoading(true)
    try {
      await user.update({
        username,
        unsafeMetadata: {
          ...(user.unsafeMetadata as object),
          lastUsernameUpdate: new Date().toISOString(),
        },
      })

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

  // Clerk step-up auth for username change
  const saveUsername = useReverification(doSaveUsername)

  // -------- PROFILE IMAGE UPLOAD --------
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
      await user.setProfileImage({ file: avatarFile })
      // Clean preview & file, refresh the image URL
      setAvatarFile(null)
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview)
        setAvatarPreview(null)
      }
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (err) {
      console.error("Failed to upload profile image:", err)
      alert("Failed to update profile image. Try again.")
    } finally {
      setAvatarUploading(false)
    }
  }

  // -------- DELETE ACCOUNT (improved with proper redirect) --------
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
      console.log("Starting account deletion...")
      
      // Optional: purge app data here before deleting Clerk user
      // await fetch("/api/purge-user", { method: "POST" })

      // Delete the user account
      await user.delete()
      
      console.log("Account deleted successfully, redirecting...")
      
      // Force redirect to landing page
      window.location.href = "/"
      
    } catch (err) {
      console.error("Delete failed:", err)
      alert("Account deletion failed. Please try again.")
      setIsDeleting(false)
    }
  }

  // Password reset email simulation
  const handlePasswordReset = async () => {
    setIsPasswordLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (error) {
      console.error("Failed to send password reset email")
    } finally {
      setIsPasswordLoading(false)
    }
  }

  // Password change simulation
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert("New passwords don't match")
      return
    }
    if (!passwordForm.currentPassword || !passwordForm.newPassword) return

    setIsPasswordLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
      setShowPasswordForm(false)
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
    } catch (error) {
      console.error("Failed to change password")
    } finally {
      setIsPasswordLoading(false)
    }
  }

  // Theme toggle UI
  const ThemeToggle = () => {
    if (!mounted) return null

    const getThemeIcon = () => {
      switch (theme) {
        case "light":
          return <Sun className="w-4 h-4" />
        case "dark":
          return <Moon className="w-4 h-4" />
        default:
          return <Monitor className="w-4 h-4" />
      }
    }

    const getNextTheme = () => {
      switch (theme) {
        case "light":
          return "dark"
        case "dark":
          return "system"
        default:
          return "light"
      }
    }

    const getThemeLabel = () => {
      switch (theme) {
        case "light":
          return "Light"
        case "dark":
          return "Dark"
        default:
          return "System"
      }
    }

    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getThemeIcon()}
          <div>
            <p className="font-sans font-medium text-clay-700 dark:text-sand-200">Theme</p>
            <p className="text-sm text-clay-500 dark:text-sand-400 font-sans">
              Current: {getThemeLabel()}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setTheme(getNextTheme())}
          variant="outline"
          size="sm"
          className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 hover:bg-sage-100 dark:hover:bg-gray-600 text-clay-600 dark:text-sand-300 font-sans backdrop-blur-sm transition-all duration-200"
        >
          {getThemeIcon()}
          <span className="ml-2">{getThemeLabel()}</span>
        </Button>
      </div>
    )
  }

  // Show loading spinner while determining user state
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sage-500" />
      </div>
    )
  }

  // Don't render anything if user doesn't exist (redirect will happen)
  if (!user) {
    return null
  }

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
            <Button
              variant="ghost"
              size="sm"
              className="text-clay-500 hover:text-clay-600 dark:text-sand-400 dark:hover:text-sand-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="font-display text-clay-700 dark:text-sand-200 text-2xl">Profile</h1>
        </div>

        {/* Profile Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Card className="bg-gradient-to-br from-white/50 via-sage-50/30 to-sand-50/50 dark:from-gray-800/50 dark:via-gray-700/30 dark:to-gray-800/50 border-sage-200/50 dark:border-gray-600/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-sage-400 via-clay-400 to-sand-400 dark:from-sage-500 dark:via-clay-500 dark:to-sand-500 flex items-center justify-center shadow-lg">
                    {/* Current avatar or initials */}
                    {user?.imageUrl && !avatarPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.imageUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : avatarPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarPreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-8 h-8 text-white" />
                    )}
                  </div>

                  {/* Avatar uploader */}
                  <label
                    htmlFor="avatar"
                    className="absolute -bottom-2 -right-2 cursor-pointer rounded-full bg-white/80 dark:bg-gray-800/80 border border-sage-200 dark:border-gray-700 p-1.5 shadow-sm"
                    title="Change profile photo"
                  >
                    <ImagePlus className="w-4 h-4 text-clay-600 dark:text-sand-300" />
                    <input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onAvatarFileChange}
                    />
                  </label>
                </div>

                <div>
                  <h3 className="font-display text-clay-700 dark:text-sand-200 text-lg">Your Profile</h3>
                  <p className="text-clay-500 dark:text-sand-400 text-sm font-sans">Manage your account settings</p>
                </div>
              </div>

              {/* Save/Cancel avatar buttons */}
              {avatarPreview && (
                <div className="flex gap-2 mb-6">
                  <Button
                    onClick={saveAvatar}
                    disabled={avatarUploading}
                    className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white rounded-xl"
                  >
                    {avatarUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save Photo"
                    )}
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
                {/* Username (editable with cooldown) */}
                <div>
                  <Label htmlFor="username" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">
                    Username
                  </Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={!canChangeUsername()}
                    className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 font-sans text-clay-700 dark:text-sand-100 backdrop-blur-sm"
                    placeholder="Choose your username"
                  />
                  {!canChangeUsername() && (
                    <p className="text-xs text-red-500 mt-1">
                      You can only change your username once every 7 days.
                    </p>
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
                  <Label htmlFor="name" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    readOnly
                    disabled
                    className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-gray-100/70 dark:bg-gray-700/60 font-sans text-clay-700 dark:text-sand-100 cursor-not-allowed"
                    placeholder="Your full name"
                  />
                </div>

                {/* Email (read-only) */}
                <div>
                  <Label htmlFor="email" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    value={email}
                    readOnly
                    disabled
                    className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-gray-100/70 dark:bg-gray-700/60 font-sans text-clay-700 dark:text-sand-100 cursor-not-allowed"
                    placeholder="Your email address"
                    type="email"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="font-display text-clay-700 dark:text-sand-200 text-xl mb-4">Security</h2>
          <Card className="bg-gradient-to-br from-white/50 via-sage-50/30 to-sand-50/50 dark:from-gray-800/50 dark:via-gray-700/30 dark:to-gray-800/50 border-sage-200/50 dark:border-gray-600/50 backdrop-blur-sm">
            <CardContent className="p-6">
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

              {/* Password Change Form */}
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
                    <Label
                      htmlFor="currentPassword"
                      className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium my-0 py-0.5"
                    >
                      Current Password
                    </Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                      }
                      disabled={isPasswordLoading}
                      className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 font-sans disabled:opacity-50 text-clay-700 dark:text-sand-100 backdrop-blur-sm"
                      placeholder="Enter new password"
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="confirmPassword"
                      className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium"
                    >
                      Confirm New Password
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                      }
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

                  {/* Optional: reset link */}
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handlePasswordReset}
                      disabled={isPasswordLoading}
                      className="text-sm"
                    >
                      {isPasswordLoading ? "Sending reset…" : "Send password reset email"}
                    </Button>
                  </div>
                </motion.form>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <h2 className="font-display text-clay-700 dark:text-sand-200 text-xl mb-4">Settings</h2>
          <Card className="bg-gradient-to-br from-white/50 via-sage-50/30 to-sand-50/50 dark:from-gray-800/50 dark:via-gray-700/30 dark:to-gray-800/50 border-sage-200/50 dark:border-gray-600/50 backdrop-blur-sm">
            <CardContent className="p-6 space-y-6">
              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Notifications */}
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

              {/* Data Sharing */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-sage-500 dark:text-sand-400" />
                  <div>
                    <p className="font-sans font-medium text-clay-700 dark:text-sand-200">Share anonymous data</p>
                    <p className="text-sm text-clay-500 dark:text-sand-400 font-sans">
                      Help us improve by sharing usage metrics.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={dataSharing}
                  onCheckedChange={setDataSharing}
                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-sage-500 data-[state=checked]:to-clay-500 dark:data-[state=checked]:from-sage-600 dark:data-[state=checked]:to-clay-600"
                />
              </div>

              {/* Danger Zone */}
              <div className="pt-2">
                <Button
                  onClick={doDeleteAccount}
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
        <motion.div
          className="text-center pt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <p className="text-clay-500 dark:text-sand-400 font-sans text-xs">
            Need help? Contact us at{" "}
            <a
              href="mailto:support@slurpy.ai"
              className="underline hover:text-clay-600 dark:hover:text-sand-300 transition-colors"
            >
              support@slurpy.ai
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}