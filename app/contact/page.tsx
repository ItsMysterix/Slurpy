"use client"

import type React from "react"

import { motion } from "framer-motion"
import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Mail, MessageCircle, Send, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 2000))

    setIsSubmitted(true)
    setIsSubmitting(false)
  }

  const contactMethods = [
    {
      icon: Mail,
      title: "Email Support",
      description: "Get help with your account or technical issues",
      contact: "support@slurpy.ai",
      action: "Send Email",
    },
    {
      icon: MessageCircle,
      title: "General Inquiries",
      description: "Questions about Slurpy or partnerships",
      contact: "hello@slurpy.ai",
      action: "Get in Touch",
    },
  ]

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-sand-50 dark:bg-[#1d1f1d] flex items-center justify-center px-4">
        <motion.div
          className="text-center max-w-md"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div className="w-16 h-16 bg-sage-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
          <h2 className="font-display text-3xl text-sage-600 dark:text-sage-200 mb-4">Message Sent!</h2>
          <p className="text-sage-500 dark:text-sage-300 mb-8 font-sans">
            Thank you for reaching out. We'll get back to you within 24 hours.
          </p>
          <Link href="/">
            <Button className="bg-sage-500 hover:bg-sage-400 text-white rounded-xl px-6 py-3 font-sans">
              Back to Home
            </Button>
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sand-50 dark:bg-[#1d1f1d]">
      {/* Header */}
      <div className="bg-white/80 dark:bg-sage-900/80 backdrop-blur-lg border-b border-sand-200 dark:border-sage-700 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-sage-600 hover:text-sage-500">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <h1 className="font-display text-2xl text-sage-600 dark:text-sage-300">Contact Us</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Intro */}
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-4xl text-sage-600 dark:text-sage-200 mb-4">We're Here to Help</h2>
          <p className="text-lg text-sage-500 dark:text-sage-300 max-w-2xl mx-auto leading-relaxed">
            Have questions, feedback, or need support? We'd love to hear from you.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Methods */}
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h3 className="font-display text-2xl text-sage-600 dark:text-sage-200 mb-6">Get in Touch</h3>

            {contactMethods.map((method, index) => {
              const Icon = method.icon
              return (
                <Card
                  key={method.title}
                  className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50"
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sage-400 to-sage-500 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-display text-xl text-sage-600 dark:text-sage-200 mb-2">{method.title}</h4>
                        <p className="text-sage-500 dark:text-sage-300 font-sans mb-3">{method.description}</p>
                        <a
                          href={`mailto:${method.contact}`}
                          className="text-sage-600 dark:text-sage-400 font-sans font-medium hover:underline"
                        >
                          {method.contact}
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {/* FAQ Link */}
            <Card className="bg-sage-100/60 dark:bg-sage-800/60 border-sage-200/50 dark:border-sage-700/50">
              <CardContent className="p-6 text-center">
                <h4 className="font-display text-xl text-sage-600 dark:text-sage-200 mb-2">Quick Answers</h4>
                <p className="text-sage-500 dark:text-sage-300 font-sans mb-4">
                  Check our FAQ for instant answers to common questions.
                </p>
                <Link href="/faq">
                  <Button variant="outline" className="border-sage-300 text-sage-600 hover:bg-sage-200 bg-transparent">
                    View FAQ
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
              <CardContent className="p-8">
                <h3 className="font-display text-2xl text-sage-600 dark:text-sage-200 mb-6">Send us a Message</h3>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name" className="text-sage-600 dark:text-sage-300 font-sans">
                        Name
                      </Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="mt-1 rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="email" className="text-sage-600 dark:text-sage-300 font-sans">
                        Email
                      </Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="mt-1 rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="subject" className="text-sage-600 dark:text-sage-300 font-sans">
                      Subject
                    </Label>
                    <Input
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      className="mt-1 rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="message" className="text-sage-600 dark:text-sage-300 font-sans">
                      Message
                    </Label>
                    <Textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      rows={5}
                      className="mt-1 rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50 resize-none"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-sage-500 hover:bg-sage-400 text-white rounded-xl py-3 font-sans font-medium"
                  >
                    {isSubmitting ? (
                      "Sending..."
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
