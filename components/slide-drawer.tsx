"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Menu, X, Check, Circle, MoreVertical, Calendar, BookOpen, MessageCircle, BarChart3, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { FloatingLeaves } from "@/components/floating-leaves"
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
        className={`fixed inset-y-0 left-0 z-40 transition-all duration-300 ${isOpen ? "w-64" : "w-16"} bg-gradient-to-b from-white/95 via-sage-25/90 to-clay-50/95 dark:from-gray-950/95 dark:via-gray-900/90 dark:to-gray-950/95 backdrop-blur-lg border-r border-sage-200/50 dark:border-gray-700/50 flex flex-col shadow-lg overflow-hidden`}
      >
        {/* Floating Leaves Background */}
        {isOpen && (
          <div className="absolute inset-0 pointer-events-none">
            <FloatingLeaves />
          </div>
        )}

        {/* Top Section - Hamburger Button */}
        <div className={`flex ${isOpen ? 'justify-start' : 'justify-center'} p-2 relative z-10`}>
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="sm"
            className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 flex-shrink-0 w-12 h-12 rounded-xl hover:bg-sage-100/70 dark:hover:bg-gray-800/70 transition-colors"
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
            <div className="px-4 mb-3 relative z-10">
              <div className="space-y-4">
                {navigationItems.map((item, index) => {
                  const Icon = item.icon
                  const isActive = isActivePage(item.href)

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      whileHover={{ 
                        scale: 1.02,
                        y: -2,
                        transition: { duration: 0.2 }
                      }}
                    >
                      <Link href={item.href}>
                        <div
                          className={`rounded-xl p-3 border transition-all duration-200 cursor-pointer hover:shadow-lg backdrop-blur-sm ${
                            isActive
                              ? "bg-gradient-to-r from-sage-500/90 via-clay-500/90 to-sand-500/90 dark:from-sage-600/90 dark:via-clay-600/90 dark:to-sand-600/90 border-sage-400/80 dark:border-sage-500/80 shadow-md text-white"
                              : "bg-white/80 dark:bg-gray-800/90 border-sage-200/60 dark:border-gray-600/80 hover:bg-sage-100/90 dark:hover:bg-gray-700/90 hover:border-sage-300/80 dark:hover:border-gray-500/80"
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div
                              className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-sm`}
                            >
                              <Icon className="w-4 h-4 text-white" />
                            </div>
                            <span
                              className={`font-sans text-sm font-medium ${
                                isActive ? "text-white dark:text-white" : "text-clay-700 dark:text-sand-200"
                              }`}
                            >
                              {item.label}
                            </span>
                          </div>
                          <p
                            className={`text-xs font-sans ml-11 ${
                              isActive ? "text-white/90 dark:text-white/90" : "text-clay-500 dark:text-sand-400"
                            }`}
                          >
                            {item.description}
                          </p>
                        </div>
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* User Section - Expanded */}
            <div className="border-sage-200/50 dark:border-gray-700/50 p-4 flex items-center gap-3 min-h-[64px] border-t bg-gradient-to-r from-white/50 via-sage-50/30 to-sand-50/50 dark:from-gray-900/50 dark:via-gray-800/30 dark:to-gray-900/50 backdrop-blur-sm relative z-10">
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
                <Button variant="ghost" size="sm" className="text-clay-400 hover:text-clay-600 dark:text-sand-500 dark:hover:text-sand-300 p-2 transition-colors hover:bg-sage-100/50 dark:hover:bg-gray-700/50 rounded-lg">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Sign Out Button */}
            <div className="px-4 pb-4 relative z-10">
              <Button
                onClick={() => signOut()}
                className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 dark:from-red-600 dark:to-red-700 dark:hover:from-red-700 dark:hover:to-red-800 text-white justify-start font-sans text-sm rounded-xl shadow-md transition-all duration-200"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Navigation Icons - Collapsed */}
            <div className="flex-1 flex flex-col items-center py-4 space-y-4 relative z-10">
              {navigationItems.map((item, index) => {
                const Icon = item.icon
                const isActive = isActivePage(item.href)

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1, duration: 0.4 }}
                    whileHover={{ 
                      scale: 1.1,
                      y: -5,
                      transition: { duration: 0.2 }
                    }}
                  >
                    <Link href={item.href}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`w-11 h-11 rounded-xl transition-all duration-200 ${
                          isActive
                            ? "bg-gradient-to-br from-sage-500 via-clay-500 to-sand-500 dark:from-sage-600 dark:via-clay-600 dark:to-sand-600 text-white shadow-lg border border-sage-400/60 dark:border-sage-500/60"
                            : "bg-white/80 dark:bg-gray-800/90 text-clay-600 hover:text-clay-700 hover:bg-sage-100/80 dark:text-sand-300 dark:hover:text-sand-200 dark:hover:bg-gray-700/90 hover:shadow-md border border-sage-200/50 dark:border-gray-600/60 hover:border-sage-300/70 dark:hover:border-gray-500/70"
                        }`}
                        title={item.label}
                      >
                        <Icon className="w-5 h-5 text-inherit" />
                      </Button>
                    </Link>
                  </motion.div>
                )
              })}
            </div>

            {/* Bottom Section - Collapsed */}
            <div className="flex flex-col items-center pb-4 space-y-3 relative z-10">
              {/* Profile Avatar */}
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="p-0 rounded-full hover:scale-105 transition-transform hover:shadow-lg">
                  <Avatar className="w-10 h-10 shadow-md ring-2 ring-sage-200/50 dark:ring-gray-600/50">
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
                className="w-11 h-9 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 dark:from-red-600 dark:to-red-700 dark:hover:from-red-700 dark:hover:to-red-800 text-white rounded-xl p-0 shadow-md transition-all duration-200 hover:shadow-lg"
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