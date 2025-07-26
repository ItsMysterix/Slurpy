"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowLeft, Shield, Eye, Lock, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PrivacyPage() {
  const sections = [
    {
      title: "Information We Collect",
      icon: Eye,
      content: [
        "Account information (email, name) when you sign up",
        "Conversation data to provide personalized responses",
        "Usage analytics to improve our service",
        "Device information for security purposes",
      ],
    },
    {
      title: "How We Use Your Data",
      icon: Shield,
      content: [
        "Provide empathetic AI responses tailored to you",
        "Analyze emotional patterns for insights",
        "Improve our AI models and service quality",
        "Send important service updates",
      ],
    },
    {
      title: "Data Security",
      icon: Lock,
      content: [
        "End-to-end encryption for all conversations",
        "Secure cloud storage with industry standards",
        "Regular security audits and monitoring",
        "No data sharing with third parties",
      ],
    },
    {
      title: "Your Rights",
      icon: Download,
      content: [
        "Access all your personal data anytime",
        "Delete your account and all data with one click",
        "Export your conversation history",
        "Opt out of analytics and data processing",
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-sand-50 dark:bg-[#1d1f1d]">
      {/* Header */}
      <div className="bg-white/80 dark:bg-sage-900/80 backdrop-blur-lg border-b border-sand-200 dark:border-sage-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-sage-600 hover:text-sage-500">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <h1 className="font-display text-2xl text-sage-600 dark:text-sage-300">Privacy Policy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Intro */}
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-4xl text-sage-600 dark:text-sage-200 mb-4">Your Privacy Matters</h2>
          <p className="text-lg text-sage-500 dark:text-sage-300 max-w-2xl mx-auto leading-relaxed">
            At Slurpy, we believe mental health conversations should be private and secure. Here's exactly how we
            protect your data.
          </p>
          <p className="text-sm text-sage-400 mt-4">Last updated: January 2024</p>
        </motion.div>

        {/* Sections */}
        <div className="space-y-8">
          {sections.map((section, index) => {
            const Icon = section.icon
            return (
              <motion.div
                key={section.title}
                className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg rounded-3xl p-8 shadow-soft border border-sand-200/50 dark:border-sage-700/50"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sage-400 to-sage-500 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-2xl text-sage-600 dark:text-sage-200 mb-4">{section.title}</h3>
                    <ul className="space-y-3">
                      {section.content.map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-sage-500 dark:text-sage-300">
                          <div className="w-2 h-2 rounded-full bg-sage-400 mt-2 flex-shrink-0" />
                          <span className="font-sans leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Contact Section */}
        <motion.div
          className="mt-16 text-center bg-sage-100/60 dark:bg-sage-800/60 rounded-3xl p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <h3 className="font-display text-2xl text-sage-600 dark:text-sage-200 mb-4">Questions About Your Privacy?</h3>
          <p className="text-sage-500 dark:text-sage-300 mb-6 font-sans">
            We're here to help. Reach out anytime with privacy concerns or questions.
          </p>
          <Link href="/contact">
            <Button className="bg-sage-500 hover:bg-sage-400 text-white rounded-xl px-6 py-3 font-sans">
              Contact Us
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
