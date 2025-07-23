"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, User, Bell, Trash2, Lock, CheckCircle } from "lucide-react"
import Link from "next/link"

export default function ProfilePage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [dataSharing, setDataSharing] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const save = async () => {
    if (!name.trim()) return
    setIsLoading(true)

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (error) {
      console.error("Failed to update name")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    setIsPasswordLoading(true)

    try {
      // Simulate password reset email
      await new Promise((resolve) => setTimeout(resolve, 1500))

      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (error) {
      console.error("Failed to send password reset email")
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

    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      return
    }

    setIsPasswordLoading(true)

    try {
      // Simulate password change API call
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

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm("Are you sure you want to delete your account? This action cannot be undone.")

    if (confirmed) {
      try {
        // Simulate account deletion
        await new Promise((resolve) => setTimeout(resolve, 1000))
        alert("Account deletion initiated")
      } catch (error) {
        console.error("Failed to delete account")
      }
    }
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
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sage-400 via-clay-400 to-sand-400 dark:from-sage-500 dark:via-clay-500 dark:to-sand-500 flex items-center justify-center shadow-lg">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="font-display text-clay-700 dark:text-sand-200 text-lg">Your Profile</h3>
                  <p className="text-clay-500 dark:text-sand-400 text-sm font-sans">Manage your account settings</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 font-sans text-clay-700 dark:text-sand-100 backdrop-blur-sm"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-clay-600 dark:text-sand-300 font-sans text-sm font-medium">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 font-sans text-clay-700 dark:text-sand-100 backdrop-blur-sm"
                    placeholder="Enter your email address"
                    type="email"
                  />
                </div>

                <Button
                  onClick={save}
                  disabled={isLoading || !name.trim() || !email.trim()}
                  className="w-full bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 dark:from-sage-600 dark:via-clay-600 dark:to-sand-600 dark:hover:from-sage-700 dark:hover:via-clay-700 dark:hover:to-sand-700 text-white rounded-xl py-2 font-sans font-medium transition-all duration-200 disabled:opacity-50 shadow-md"
                >
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
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

              {/* Account Deletion */}
              <Button
                onClick={handleDeleteAccount}
                variant="destructive"
                className="w-full justify-center font-sans text-white bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 rounded-xl shadow-md"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
              <p className="text-xs text-red-500 dark:text-red-400 mt-2 font-sans">
                This action cannot be undone. All your data will be permanently deleted.
              </p>
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
            <a href="mailto:support@slurpy.ai" className="underline hover:text-clay-600 dark:hover:text-sand-300 transition-colors">
              support@slurpy.ai
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

