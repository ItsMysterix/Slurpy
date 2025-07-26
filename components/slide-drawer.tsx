"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Menu, X, Check, Circle, MoreVertical, Calendar, BookOpen, MessageCircle, BarChart3, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useClerk, useUser } from "@clerk/nextjs"

interface SlideDrawerProps {
  onSidebarToggle?: (isOpen: boolean) => void
}

export default function SlideDrawer({ onSidebarToggle }: SlideDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const { signOut } = useClerk()
  const { user } = useUser()

  const navigationItems = [
    {
      id: "chats",
      label: "Chats",
      icon: MessageCircle,
      href: "/chat",
      description: "AI conversations",
      gradient: "from-sage-400 to-sage-500",
    },
    {
      id: "insights",
      label: "Session Insights",
      icon: BarChart3,
      href: "/insights",
      description: "Emotion analytics",
      gradient: "from-clay-400 to-clay-500",
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: Calendar,
      href: "/calendar",
      description: "Track your mood patterns",
      gradient: "from-sage-500 to-clay-400",
    },
    {
      id: "journal",
      label: "Journal",
      icon: BookOpen,
      href: "/journal",
      description: "Reflect on your thoughts",
      gradient: "from-clay-400 to-sage-400",
    },
  ]

  const progressSteps = [
    { label: "Listening", status: "completed", icon: Check, color: "text-sage-500 dark:text-sage-400" },
    { label: "Analyzing", status: "current", icon: Circle, color: "text-clay-400 dark:text-clay-300" },
    { label: "Roadmap", status: "pending", icon: Circle, color: "text-sand-400 dark:text-sand-300" },
  ]

  const isActivePage = (href: string) => {
    return pathname === href
  }

  const toggleSidebar = () => {
    const newState = !isOpen
    setIsOpen(newState)
    onSidebarToggle?.(newState)
  }

  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-all duration-300 ${isOpen ? "w-64" : "w-16"} bg-gradient-to-b from-sand-50/90 via-sage-25/80 to-clay-50/90 dark:from-gray-900/90 dark:via-gray-800/80 dark:to-gray-900/90 backdrop-blur-lg border-r border-sage-200/50 dark:border-gray-700/50 flex flex-col shadow-lg`}
      >
        {/* Top Section - Hamburger Button */}
        <div className="flex items-center justify-center p-2">
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="sm"
            className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 flex-shrink-0 w-12 h-12 rounded-xl hover:bg-sage-100 transition-colors"
            aria-label="Toggle menu"
            aria-expanded={isOpen}
          >
            <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
              {isOpen ? <X size={20} /> : <Menu size={20} />}
            </motion.div>
          </Button>
        </div>

        {/* Content - show different content based on open/closed state */}
        {isOpen ? (
          <>
            {/* Navigation Items - Expanded */}
            <div className="px-4 mb-3">
              <div className="space-y-3">
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  const isActive = isActivePage(item.href)

                  return (
                    <Link key={item.id} href={item.href}>
                      <div
                        className={`bg-white/50 dark:bg-sage-800/50 rounded-xl p-3 border transition-all duration-200 cursor-pointer hover:shadow-md ${
                          isActive
                            ? "border-sage-300 dark:border-sage-600 bg-sage-50 dark:bg-sage-700/50 shadow-sm"
                            : "border-sand-200/50 dark:border-sage-700/50 hover:border-sage-200 dark:hover:border-sage-600"
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div
                            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.gradient} flex items-center justify-center`}
                          >
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <span
                            className={`font-sans text-sm font-medium ${
                              isActive ? "text-sage-700 dark:text-sage-200" : "text-sage-600 dark:text-sage-300"
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>
                        <p
                          className={`text-xs font-sans ml-11 ${
                            isActive ? "text-sage-600 dark:text-sage-300" : "text-sage-500 dark:text-sage-400"
                          }`}
                        >
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* User Section - Expanded */}
            <div className="border-sage-200/50 dark:border-gray-700/50 p-4 flex items-center gap-3 min-h-[64px] border-t bg-gradient-to-r from-white/30 via-sage-50/20 to-sand-50/30 dark:from-gray-800/30 dark:via-gray-700/20 dark:to-gray-800/30 backdrop-blur-sm">
              <Avatar className="w-8 h-8 shadow-md">
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt="Profile"
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-clay-400 via-sage-400 to-sand-400 dark:from-clay-500 dark:via-sage-500 dark:to-sand-500 text-white text-sm">
                    {user?.firstName?.[0] ?? "U"}
                  </AvatarFallback>
                )}
              </Avatar>
              <span className="text-clay-600 dark:text-sand-300 text-sm flex-1 font-sans transition-colors">
                {user?.firstName ?? "User"}
              </span>

              <Link href="/profile">
                <Button variant="ghost" size="sm" className="text-clay-400 hover:text-clay-600 dark:text-sand-500 dark:hover:text-sand-300 p-2 transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Sign Out Button */}
            <div className="px-4 pb-4">
              <Button
                onClick={() => signOut()}
                className="w-full bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 dark:from-red-500 dark:to-red-600 dark:hover:from-red-600 dark:hover:to-red-700 text-white justify-start font-sans text-sm rounded-xl shadow-md transition-all duration-200"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Navigation Icons - Collapsed */}
            <div className="flex-1 flex flex-col items-center py-4 space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                const isActive = isActivePage(item.href)

                return (
                  <Link key={item.id} href={item.href}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`w-12 h-12 rounded-xl transition-all duration-200 ${
                        isActive
                          ? "bg-sage-100 dark:bg-sage-700/50 text-sage-700 dark:text-sage-200 shadow-sm border border-sage-200 dark:border-sage-600"
                          : "text-clay-600 hover:text-clay-700 hover:bg-sage-50 dark:text-sand-400 dark:hover:text-sand-300 dark:hover:bg-gray-800/50"
                      }`}
                      title={item.label}
                    >
                      <Icon className="w-5 h-5" />
                    </Button>
                  </Link>
                )
              })}
            </div>

            {/* Bottom Section - Collapsed */}
            <div className="flex flex-col items-center pb-4 space-y-3">
              {/* Logo */}
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sage-400 to-clay-400 flex items-center justify-center shadow-md">
                <span className="text-white font-display font-bold text-lg">S</span>
              </div>

              {/* Profile Avatar */}
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="p-0 rounded-full hover:scale-105 transition-transform">
                  <Avatar className="w-10 h-10 shadow-md">
                    {user?.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt="Profile"
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <AvatarFallback className="bg-gradient-to-br from-clay-400 via-sage-400 to-sand-400 dark:from-clay-500 dark:via-sage-500 dark:to-sand-500 text-white text-sm">
                        {user?.firstName?.[0] ?? "U"}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </Button>
              </Link>

              {/* Logout Button */}
              <Button
                size="sm"
                onClick={() => signOut()}
                className="w-12 h-8 bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 dark:from-red-500 dark:to-red-600 dark:hover:from-red-600 dark:hover:to-red-700 text-white rounded-lg p-0 shadow-md transition-all duration-200"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}