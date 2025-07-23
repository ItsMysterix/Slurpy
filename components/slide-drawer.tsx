"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Menu, X, Check, Circle, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import Link from "next/link"
import { useClerk, useUser } from "@clerk/nextjs" 

interface SlideDrawerProps {
  selectedTab?: "chats" | "analysis"
  onTabChange?: (tab: "chats" | "analysis") => void
  onSidebarToggle?: (isOpen: boolean) => void
}

export default function SlideDrawer({ selectedTab = "chats", onTabChange, onSidebarToggle }: SlideDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { signOut } = useClerk()
  const { user } = useUser()

  const progressSteps = [
    { label: "Listening", status: "completed", icon: Check, color: "text-sage-500 dark:text-sage-400" },
    { label: "Analyzing", status: "current", icon: Circle, color: "text-clay-400 dark:text-clay-300" },
    { label: "Roadmap", status: "pending", icon: Circle, color: "text-sand-400 dark:text-sand-300" },
  ]

  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-all duration-300 ${isOpen ? "w-64" : "w-16"} bg-gradient-to-b from-sand-50/90 via-sage-25/80 to-clay-50/90 dark:from-gray-900/90 dark:via-gray-800/80 dark:to-gray-900/90 backdrop-blur-lg border-r border-sage-200/50 dark:border-gray-700/50 flex flex-col shadow-lg`}
      >
        {/* Top Section - Always visible */}
        <div className="flex items-center justify-between p-2">
          {/* Hamburger Button - only show when expanded */}
          {isOpen && (
            <Button
              onClick={() => {
                setIsOpen(!isOpen)
                onSidebarToggle?.(!isOpen)
              }}
              variant="ghost"
              size="sm"
              className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 flex-shrink-0 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={isOpen}
            >
              <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                <X size={20} />
              </motion.div>
            </Button>
          )}
        </div>

        {/* Content - only show when expanded */}
        {isOpen && (
          <>
            {/* Tabs */}
            <div className="flex gap-4 px-4 border-sand-200/50 dark:border-gray-700/50 mb-0 flex-row border-b-0 my-4">
              {(["chats", "analysis"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    onTabChange?.(tab)
                    if (tab === "analysis") {
                      // This will trigger the analysis view showing current session emotions
                    }
                  }}
                  className={`font-sans text-xs pb-2 border-b-2 transition-colors capitalize ${
                    selectedTab === tab
                      ? "text-clay-600 dark:text-sand-300 border-clay-600 dark:border-sand-400"
                      : "text-clay-400 dark:text-sand-500 border-transparent hover:text-clay-500 dark:hover:text-sand-400"
                  }`}
                >
                  {tab === "analysis" ? "Session Insights" : "Chats"}
                </button>
              ))}
            </div>

            {/* Progress Steps */}
            <div className="px-4 mb-3">
              <div className="space-y-3 relative my-4">
                {progressSteps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <div key={step.label} className="flex items-center gap-2 relative">
                      {index < progressSteps.length - 1 && (
                        <div className="absolute left-2 top-5 h-3 w-px bg-sage-300 dark:bg-gray-600" />
                      )}
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center border transition-colors ${
                          step.status === "completed"
                            ? "bg-sage-500 dark:bg-sage-600 border-sage-500 dark:border-sage-600 text-white"
                            : step.status === "current"
                              ? "border-clay-400 dark:border-clay-300 text-clay-400 dark:text-clay-300 bg-white/50 dark:bg-gray-800/50"
                              : "border-sand-400 dark:border-sand-300 text-sand-400 dark:text-sand-300 bg-white/30 dark:bg-gray-800/30"
                        }`}
                      >
                        <Icon className="w-2 h-2" />
                      </div>
                      <span
                        className={`font-sans text-xs transition-colors ${
                          step.status === "pending" 
                            ? "text-clay-400 dark:text-sand-500" 
                            : "text-clay-600 dark:text-sand-300"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* User Section */}
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
                Sign out
              </Button>
            </div>
          </>
        )}

        {/* Hamburger Button at bottom when collapsed */}
        {!isOpen && (
          <div className="mt-auto mb-4 px-2">
            <Button
              onClick={() => {
                setIsOpen(!isOpen)
                onSidebarToggle?.(!isOpen)
              }}
              variant="ghost"
              size="sm"
              className="w-full text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={isOpen}
            >
              <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                <Menu size={20} />
              </motion.div>
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

