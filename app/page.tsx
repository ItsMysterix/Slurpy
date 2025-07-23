"use client"

import { motion } from "framer-motion"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  MessageCircle,
  Activity,
  HeartHandshake,
  ShieldCheck,
  Clock,
  Github,
  Twitter,
  Leaf,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/* ──────────────────────────────────────
   Client‑only import to kill hydration diff
─────────────────────────────────────── */
const FloatingParticles = dynamic(
  () => import("@/components/floating-particles"),
  { ssr: false }
)

/* ──────────────────────────────────────
   Testimonial carousel (unchanged)
─────────────────────────────────────── */
function TestimonialCarousel() {
  const testimonials = [
    { quote: "Slurpy helped me understand my anxiety patterns", name: "Sarah", emoji: "🍑" },
    { quote: "The most empathetic AI I've ever talked to", name: "Marcus", emoji: "🥝" },
    { quote: "Finally, a safe space to process my thoughts", name: "Elena", emoji: "🍊" },
    { quote: "24/7 support when I need it most", name: "David", emoji: "🍇" },
  ]

  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [testimonials.length])

  return (
    <div className="relative overflow-hidden py-16 border-t border-b border-clay-400/20">
      <motion.div
        className="flex transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {testimonials.map((t, i) => (
          <div key={i} className="w-full flex-shrink-0 text-center px-8">
            <blockquote className="text-xl italic font-display text-sage-500 mb-4">“{t.quote}”</blockquote>
            <cite className="text-sm text-sage-400">
              — {t.name} {t.emoji}
            </cite>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export default function LandingPage() {
  const router = useRouter()

  /* sticky mobile CTA trigger */
  const [isScrolled, setIsScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > window.innerHeight / 2)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleStartConversation = () => router.push("/sign-in")

  return (
    <div className="min-h-screen bg-sand-50 dark:bg-[#1d1f1d] text-sage-500 dark:text-sage-100">
      {/* ─────────── Hero Section ─────────── */}
      <section className="relative min-h-[70vh] container mx-auto px-4 py-16">
        <FloatingParticles />

        <div className="grid lg:grid-cols-2 gap-12 items-center h-full relative z-10">
          {/* Left column */}
          <div className="flex flex-col gap-6 mx-16 my-6">
            <motion.h1
              className="font-display text-sage-500 dark:text-sage-100 font-extrabold text-left py-0.5 text-6xl my-0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              Hi, I'm Slurpy.
            </motion.h1>

            <motion.p
              className="text-xl text-sage-400 dark:text-sage-200 font-sans leading-relaxed text-left"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              Your AI companion to untangle thoughts and track emotions.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 items-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <Button
                onClick={handleStartConversation}
                className="bg-sage-500 hover:bg-sage-400 text-white px-8 py-3 rounded-2xl font-sans font-medium"
              >
                Start a Conversation
              </Button>

              <Link
                href="/how-it-works"
                className="text-clay-400 hover:underline font-sans px-4 my-0 py-2 font-semibold"
              >
                How it works?
              </Link>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }}>
              <Badge variant="secondary" className="bg-sand-200 text-sage-500 border-sage-200">
                <Clock className="w-3 h-3 mr-1" />
                available 24/7
              </Badge>
            </motion.div>
          </div>

          {/* Right column */}
          <div className="flex justify-center lg:justify-end">
            <motion.div
              className="relative h-80 w-80 md:h-96 md:w-96 rounded-full bg-gradient-to-br from-sand-50/60 to-sage-100/60 backdrop-blur-md ring-1 ring-sage-100/50 flex items-center justify-center shadow-lg mx-14 my-1.5"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.3 }}
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <MessageCircle className="w-24 h-24 text-sage-400 stroke-1" />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─────────── Benefits Grid ─────────── */}
      <section className="container mx-auto px-4 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="grid md:grid-cols-3 gap-6"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            {[
              {
                icon: Activity,
                title: "Understand Patterns",
                description: "Track emotional trends and discover insights about your mental wellbeing over time.",
              },
              {
                icon: HeartHandshake,
                title: "Calm, Empathetic Replies",
                description: "Receive thoughtful, compassionate responses tailored to your unique emotional state.",
              },
              {
                icon: ShieldCheck,
                title: "Private & Secure",
                description: "Your conversations are encrypted and private. Your mental health journey stays yours.",
              },
            ].map((b, i) => (
              <motion.div key={i} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                <Card className="bg-sand-200 border-sand-50 shadow-soft rounded-3xl p-6 h-full">
                  <CardContent className="p-0">
                    <div className="mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-clay-400 to-sage-300 flex items-center justify-center mb-4">
                        <b.icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="font-display font-semibold text-xl text-sage-500 mb-2">{b.title}</h3>
                      <p className="text-sage-400 font-sans leading-relaxed">{b.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─────────── Testimonial Carousel ─────────── */}
      <TestimonialCarousel />

      {/* ─────────── How It Works ─────────── */}
      <section id="how-it-works" className="container mx-auto px-4 py-24">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            className="font-display text-4xl text-center text-sage-500 dark:text-sage-100 mb-16 font-extrabold"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            How It Works
          </motion.h2>

          <div className="space-y-12">
            {[
              {
                step: "1",
                title: "Sign up",
                description: "Create your account in seconds. No lengthy forms, just simple setup.",
                icon: Leaf,
              },
              {
                step: "2",
                title: "Share a feeling",
                description: "Tell Slurpy what's on your mind. No judgment, just understanding.",
                icon: MessageCircle,
              },
              {
                step: "3",
                title: "Get insight",
                description: "Receive personalized insights and track your emotional patterns.",
                icon: BarChart3,
              },
            ].map((it, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-6"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: i * 0.2 }}
                viewport={{ once: true }}
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-sage-500 text-white flex items-center justify-center font-display font-bold text-lg">
                  {it.step}
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-semibold text-2xl text-sage-500 dark:text-sage-100 mb-2">
                    {it.title}
                  </h3>
                  <p className="text-sage-400 dark:text-sage-200 font-sans leading-relaxed">
                    {it.description}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <it.icon className="w-8 h-8 text-sage-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── CTA Strip ─────────── */}
      <section className="py-16 bg-sage-100 dark:bg-sage-500/10">
        <div className="container mx-auto px-4 text-center">
          <motion.h2
            className="font-display font-bold text-4xl text-sage-500 dark:text-sage-100 mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            Ready for a calmer mind?
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <Button
              onClick={handleStartConversation}
              className="bg-sage-500 hover:bg-sage-400 text-white px-8 py-3 rounded-2xl font-sans font-medium text-lg"
            >
              Start a Conversation
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─────────── Footer ─────────── */}
      <footer className="bg-sand-200 dark:bg-[#2a2d2a] py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="mx-3">
              <h3 className="font-display font-bold text-2xl text-sage-500 dark:text-sage-100 mb-2">Slurpy</h3>
              <p className="text-sage-400 dark:text-sage-200 text-sm">© 2024 Slurpy. All rights reserved.</p>
            </div>
            <div className="flex items-center justify-start md:justify-end gap-6 mx-5">
              <Link href="/privacy" className="text-sage-400 hover:text-sage-500 font-sans text-sm">
                Privacy
              </Link>
              <Link href="/contact" className="text-sage-400 hover:text-sage-500 font-sans text-sm">
                Contact
              </Link>
              <div className="flex gap-3 ml-4">
                <Link href="#" className="text-clay-400 hover:text-clay-500">
                  <Github className="w-5 h-5" />
                </Link>
                <Link href="#" className="text-clay-400 hover:text-clay-500">
                  <Twitter className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* ─────────── Mobile Sticky CTA ─────────── */}
      {isScrolled && (
        <motion.div
          className="fixed bottom-4 left-4 right-4 md:hidden z-50"
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Button
            onClick={handleStartConversation}
            className="w-full bg-sage-500 hover:bg-sage-400 text-white py-4 rounded-2xl font-sans font-medium shadow-lg"
          >
            Start a Conversation
          </Button>
        </motion.div>
      )}
    </div>
  )
}
