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
    { label: "Listening", status: "completed", icon: Check, color: "text-sage-500" },
    { label: "Analyzing", status: "current", icon: Circle, color: "text-clay-400" },
    { label: "Roadmap", status: "pending", icon: Circle, color: "text-sand-400" },
  ]

  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-all duration-300 ${isOpen ? "w-64" : "w-16"} bg-sand-50/90 backdrop-blur-lg border-r border-sand-200 flex flex-col`}
      >
        {/* Top Section - Always visible */}
        <div className="flex items-center justify-between p-2">
          {/* App Logo - Always visible */}

          {/* Hamburger Button - only show when expanded */}
          {isOpen && (
            <Button
              onClick={() => {
                setIsOpen(!isOpen)
                onSidebarToggle?.(!isOpen)
              }}
              variant="ghost"
              size="sm"
              className="text-sage-600 hover:text-sage-500 p-2 flex-shrink-0"
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
            <div className="flex gap-4 px-4 border-sand-200 mb-00p]0]x flex-row border-b-0 my-4">
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
                      ? "text-sage-600 border-sage-600"
                      : "text-sage-400 border-transparent hover:text-sage-500"
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
                        <div className="absolute left-2 top-5 h-3 w-px bg-sage-300" />
                      )}
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                          step.status === "completed"
                            ? "bg-sage-500 border-sage-500 text-white"
                            : step.status === "current"
                              ? "border-clay-400 text-clay-400"
                              : "border-sand-400 text-sand-400"
                        }`}
                      >
                        <Icon className="w-2 h-2" />
                      </div>
                      <span
                        className={`font-sans text-xs ${step.status === "pending" ? "text-sage-400" : "text-sage-600"}`}
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
            <div className="border-sand-200 p-4 flex items-center gap-3 min-h-[64px] border-t-0-[px]-2-0">
              <Avatar className="w-8 h-8">
  {user?.imageUrl ? (
    <img
      src={user.imageUrl}
      alt="Profile"
      className="w-full h-full object-cover rounded-full"
    />
  ) : (
    <AvatarFallback className="bg-clay-400 text-white text-sm">
      {user?.firstName?.[0] ?? "U"}
    </AvatarFallback>
  )}
</Avatar>
<span className="text-sage-500 text-sm flex-1 font-sans">
  {user?.firstName ?? "User"}
</span>

              <Link href="/profile">
                <Button variant="ghost" size="sm" className="text-sage-400 hover:text-sage-600 p-2">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* 🔴 Sign Out Button */}
            <div className="px-4 pb-4">
              <Button
                onClick={() => signOut()}
                className="w-full bg-red-400 hover:bg-red-500 text-white justify-start font-sans text-sm"
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
              className="w-full text-sage-600 hover:text-sage-500 p-2"
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
 