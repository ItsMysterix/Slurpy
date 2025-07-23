"use client"

import type React from "react"

import { motion } from "framer-motion"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { FloatingLeaves } from "@/components/floating-leaves"
import { Chrome, Apple, Mail, Lock, User, Eye, EyeOff } from "lucide-react"

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission here
    console.log("Form submitted:", formData)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-50 to-clay-400/10 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Floating Leaves Background */}
      <FloatingLeaves />

      {/* Auth Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-sand-50/70 backdrop-blur-lg rounded-3xl p-10 shadow-soft border border-white/20">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.h1
              className="font-display text-3xl font-bold text-sage-500 mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {isSignUp ? "Join Slurpy 🌱" : "Welcome back 👋"}
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

          {/* OAuth Buttons */}
          <motion.div
            className="space-y-3 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-3 rounded-xl border-sand-200 bg-white/50 hover:bg-sage-100 py-6 font-sans font-medium text-sage-600 transition-all duration-200"
            >
              <Chrome className="h-5 w-5" />
              Continue with Google
            </Button>

            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-3 rounded-xl border-sand-200 bg-white/50 hover:bg-sage-100 py-6 font-sans font-medium text-sage-600 transition-all duration-200"
            >
              <Apple className="h-5 w-5" />
              Continue with Apple
            </Button>
          </motion.div>

          {/* Divider */}
          <motion.div
            className="relative mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Separator className="bg-sage-200" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-sand-50/70 px-4 text-xs text-sage-400 font-sans">or continue with email</span>
            </div>
          </motion.div>

          {/* Email/Password Form */}
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            {/* Name Fields (Sign Up Only) */}
            {isSignUp && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sage-600 font-sans text-sm font-medium">
                    First name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-sage-400" />
                    <Input
                      id="firstName"
                      name="firstName"
                      type="text"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans"
                      placeholder="John"
                      required={isSignUp}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sage-600 font-sans text-sm font-medium">
                    Last name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-sage-400" />
                    <Input
                      id="lastName"
                      name="lastName"
                      type="text"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans"
                      placeholder="Doe"
                      required={isSignUp}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sage-600 font-sans text-sm font-medium">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="pl-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sage-600 font-sans text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-sage-400" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleInputChange}
                  className="pl-10 pr-10 rounded-xl border-sand-200 bg-white/50 focus:bg-white focus:border-sage-300 font-sans"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sage-400 hover:text-sage-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-6 font-sans font-medium text-base transition-all duration-200 mt-6"
            >
              {isSignUp ? "Create account" : "Sign in"}
            </Button>
          </motion.form>

          {/* Toggle Sign In/Up */}
          <motion.div
            className="text-center mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <p className="text-sage-400 font-sans text-sm">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sage-500 hover:text-sage-600 font-medium underline underline-offset-2"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>
          </motion.div>

          {/* Forgot Password (Sign In Only) */}
          {!isSignUp && (
            <motion.div
              className="text-center mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.9 }}
            >
              <button className="text-sage-400 hover:text-sage-500 font-sans text-sm underline underline-offset-2">
                Forgot your password?
              </button>
            </motion.div>
          )}
        </div>

        {/* Privacy Notice */}
        <motion.div
          className="text-center mt-6 px-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1 }}
        >
          <p className="text-sage-400 font-sans text-xs leading-relaxed">
            By continuing, you agree to our{" "}
            <a href="/terms" className="underline hover:text-sage-500">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-sage-500">
              Privacy Policy
            </a>
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
