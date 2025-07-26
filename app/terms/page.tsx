"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowLeft, FileText, AlertTriangle, Users, Gavel } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function TermsPage() {
  const sections = [
    {
      title: "Acceptance of Terms",
      icon: FileText,
      content: [
        "By using Slurpy, you agree to these terms and conditions",
        "These terms may be updated periodically with notice",
        "Continued use constitutes acceptance of any changes",
        "You must be 13 or older to use our service",
      ],
    },
    {
      title: "Service Description",
      icon: Users,
      content: [
        "Slurpy provides AI-powered emotional support and conversation",
        "Our service is for informational and support purposes only",
        "We do not provide medical, therapeutic, or crisis intervention",
        "Service availability may vary and is not guaranteed 24/7",
      ],
    },
    {
      title: "User Responsibilities",
      icon: Gavel,
      content: [
        "Provide accurate information during registration",
        "Use the service responsibly and lawfully",
        "Do not share your account with others",
        "Report any technical issues or concerns promptly",
      ],
    },
    {
      title: "Important Limitations",
      icon: AlertTriangle,
      content: [
        "Slurpy is not a replacement for professional mental health care",
        "In crisis situations, contact emergency services immediately",
        "We cannot guarantee the accuracy of AI responses",
        "Service may be interrupted for maintenance or updates",
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
          <h1 className="font-display text-2xl text-sage-600 dark:text-sage-300">Terms of Service</h1>
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
          <h2 className="font-display text-4xl text-sage-600 dark:text-sage-200 mb-4">Terms of Service</h2>
          <p className="text-lg text-sage-500 dark:text-sage-300 max-w-2xl mx-auto leading-relaxed">
            These terms govern your use of Slurpy. Please read them carefully to understand your rights and
            responsibilities.
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
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-clay-400 to-sage-400 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-2xl text-sage-600 dark:text-sage-200 mb-4">{section.title}</h3>
                    <ul className="space-y-3">
                      {section.content.map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-sage-500 dark:text-sage-300">
                          <div className="w-2 h-2 rounded-full bg-clay-400 mt-2 flex-shrink-0" />
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

        {/* Crisis Resources */}
        <motion.div
          className="mt-16 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-3xl p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-display text-xl text-red-700 dark:text-red-400 mb-3">Crisis Resources</h3>
              <p className="text-red-600 dark:text-red-300 font-sans mb-4">
                If you're experiencing a mental health crisis, please contact emergency services or these resources
                immediately:
              </p>
              <ul className="space-y-2 text-red-600 dark:text-red-300 font-sans">
                <li>• National Suicide Prevention Lifeline: 988</li>
                <li>• Crisis Text Line: Text HOME to 741741</li>
                <li>• Emergency Services: 911</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Contact Section */}
        <motion.div
          className="mt-8 text-center bg-sage-100/60 dark:bg-sage-800/60 rounded-3xl p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <h3 className="font-display text-2xl text-sage-600 dark:text-sage-200 mb-4">Questions About These Terms?</h3>
          <p className="text-sage-500 dark:text-sage-300 mb-6 font-sans">
            We're here to clarify any questions you have about our terms of service.
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
