"use client"

import { motion } from "framer-motion"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
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
  Brain,
  Zap,
  Users,
  Award,
  Heart,
  Star,
  LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "next-themes"

/* ──────────────────────────────────────
   Client‑only import to kill hydration diff
─────────────────────────────────────── */
const FloatingParticles = dynamic(
  () => import("@/components/floating-particles"),
  { ssr: false }
)

/* ──────────────────────────────────────
   Types for better type safety
─────────────────────────────────────── */
interface Testimonial {
  quote: string
  name: string
  emoji: string
}

interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

interface Service {
  icon: LucideIcon
  title: string
  description: string
}

interface Stat {
  number: string
  label: string
}

interface Step {
  step: string
  title: string
  description: string
  icon: LucideIcon
}

/* ──────────────────────────────────────
   Testimonial carousel component
─────────────────────────────────────── */
function TestimonialCarousel() {
  const testimonials: Testimonial[] = [
    { quote: "Slurpy helped me understand my anxiety patterns", name: "Sarah", emoji: "🍑" },
    { quote: "The most empathetic AI I've ever talked to", name: "Marcus", emoji: "🥝" },
    { quote: "Finally, a safe space to process my thoughts", name: "Elena", emoji: "🍊" },
    { quote: "24/7 support when I need it most", name: "David", emoji: "🍇" },
    { quote: "Better than my therapist for daily check-ins", name: "Maya", emoji: "🍓" },
    { quote: "Slurpy gets me in ways humans sometimes don't", name: "Alex", emoji: "🥭" },
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
            <blockquote className="text-xl italic font-display text-sage-500 mb-4">"{t.quote}"</blockquote>
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
  const { setTheme, theme } = useTheme()

  /* sticky mobile CTA trigger */
  const [isScrolled, setIsScrolled] = useState(false)
  
  const handleScroll = useCallback(() => {
    const scrolled = window.scrollY > window.innerHeight / 2
    setIsScrolled(scrolled)
  }, [])

  useEffect(() => {
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  // Force light mode on landing page
  useEffect(() => {
    const originalTheme = theme
    setTheme("light")
    
    return () => {
      if (originalTheme && originalTheme !== "light") {
        setTheme(originalTheme)
      }
    }
  }, [setTheme, theme])

  const handleStartConversation = useCallback(() => {
    router.push("/sign-in")
  }, [router])

  // Feature data
  const features: Feature[] = [
    {
      icon: Brain,
      title: "Therapeutic Intelligence",
      description: "Trained in CBT, DBT, and mindfulness techniques. Slurpy applies evidence-based therapy methods to help you process emotions effectively.",
    },
    {
      icon: Heart,
      title: "Empathetic Responses",
      description: "Advanced emotional AI that understands context, validates your feelings, and responds with genuine compassion - not generic platitudes.",
    },
    {
      icon: Zap,
      title: "Instant Availability", 
      description: "No waiting rooms, no appointments. Get mental health support the moment you need it, whether it's 3 AM or during a crisis.",
    },
    {
      icon: Activity,
      title: "Pattern Recognition",
      description: "Identifies emotional patterns, triggers, and progress over time. Helps you understand your mental health journey with data-driven insights.",
    },
    {
      icon: ShieldCheck,
      title: "Complete Privacy",
      description: "End-to-end encrypted conversations. No therapist notes, no insurance records. Your mental health journey stays completely private.",
    },
    {
      icon: Users,
      title: "Personalized Care",
      description: "Adapts to your communication style, remembers your history, and personalizes responses to your unique needs and preferences.",
    },
  ]

  // Service data
  const services: Service[] = [
    {
      icon: Heart,
      title: "Crisis Support",
      description: "24/7 immediate support during mental health crises with suicide prevention protocols and emergency resources."
    },
    {
      icon: Brain,
      title: "Therapy Sessions",
      description: "Structured therapeutic conversations using CBT, DBT, and other evidence-based approaches for lasting change."
    },
    {
      icon: Activity,
      title: "Mood Tracking",
      description: "Advanced emotional analytics to track patterns, identify triggers, and monitor your mental health progress."
    },
    {
      icon: Star,
      title: "Wellness Coaching",
      description: "Daily check-ins, mindfulness exercises, and personalized wellness plans to maintain optimal mental health."
    }
  ]

  // Stats data
  const stats: Stat[] = [
    { number: "95%", label: "Report feeling better after sessions" },
    { number: "<2min", label: "Average response time" },
    { number: "24/7", label: "Always available support" },
    { number: "100%", label: "Private & confidential" }
  ]

  // Steps data
  const steps: Step[] = [
    {
      step: "1",
      title: "Sign up in seconds",
      description: "Create your secure account with just your email. No lengthy intake forms or insurance requirements - start your mental health journey immediately.",
      icon: Leaf,
    },
    {
      step: "2",
      title: "Share what's on your mind",
      description: "Tell Slurpy about your thoughts, feelings, or struggles. Our AI understands context, emotions, and responds with genuine empathy and evidence-based guidance.",
      icon: MessageCircle,
    },
    {
      step: "3",
      title: "Get personalized insights",
      description: "Receive therapeutic responses, track emotional patterns, and build coping strategies. Slurpy learns your preferences and adapts to support your unique mental health needs.",
      icon: BarChart3,
    },
  ]

  return (
    <div className="min-h-screen bg-sand-50 text-sage-500">
      {/* ─────────── Hero Section ─────────── */}
      <section className="relative min-h-[70vh] container mx-auto px-6 py-16">
        <FloatingParticles />

        <div className="grid lg:grid-cols-2 gap-12 items-center h-full relative z-10 max-w-7xl mx-auto">
          {/* Left column */}
          <div className="flex flex-col gap-6">
            <motion.h1
              className="font-display text-sage-500 font-extrabold text-left py-0.5 text-6xl my-0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              Hi, I'm Slurpy.
            </motion.h1>

            <motion.p
              className="text-xl text-sage-400 font-sans leading-relaxed text-left"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              Your AI companion for mental wellness. Trained in therapeutic techniques, 
              available 24/7, and designed to understand your unique emotional journey.
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
                href="#how-it-works"
                className="text-clay-400 hover:underline font-sans px-4 my-0 py-2 font-semibold"
              >
                How it works?
              </Link>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <Badge variant="secondary" className="bg-sand-200 text-sage-500 border-sage-200">
                <Clock className="w-3 h-3 mr-1" />
                available 24/7
              </Badge>
            </motion.div>
          </div>

          {/* Right column - Using actual Slurpy image */}
          <div className="flex justify-center lg:justify-end">
            <motion.div
              className="relative h-80 w-80 md:h-96 md:w-96 rounded-full bg-gradient-to-br from-sand-50/60 to-sage-100/60 backdrop-blur-md ring-1 ring-sage-100/50 flex items-center justify-center shadow-lg"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.3 }}
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                {/* Use the actual Slurpy image */}
                <div className="relative w-48 h-48">
                  <Image
                    src="/slurpy/components/slurpy2-0.png"
                    alt="Slurpy - Your AI mental wellness companion"
                    fill
                    className="object-contain"
                    priority
                    sizes="(max-width: 768px) 192px, 192px"
                  />
                </div>
                
                {/* Speech bubble */}
                <motion.div
                  className="absolute -right-16 -top-8 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-2 shadow-lg border border-sage-200/50"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.5, duration: 0.5 }}
                >
                  <div className="text-sage-600 font-sans text-sm font-medium">
                    Hi there! 👋
                  </div>
                  {/* Speech bubble tail */}
                  <div className="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-white/90"></div>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─────────── Why Choose Slurpy Section ─────────── */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-4xl font-extrabold text-sage-500 mb-4">
              Why Slurpy is Different
            </h2>
            <p className="text-xl text-sage-400 font-sans leading-relaxed max-w-3xl mx-auto">
              Unlike generic chatbots, Slurpy is built specifically for mental health support with 
              evidence-based therapeutic approaches and deep emotional intelligence.
            </p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-3 gap-8"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            {features.map((feature, i) => (
              <motion.div key={i} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                <Card className="bg-sand-200 border-sand-50 shadow-soft rounded-3xl p-8 h-full">
                  <CardContent className="p-0">
                    <div className="mb-6">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-clay-400 to-sage-300 flex items-center justify-center mb-6">
                        <feature.icon className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="font-display font-semibold text-xl text-sage-500 mb-3">{feature.title}</h3>
                      <p className="text-sage-400 font-sans leading-relaxed text-sm">{feature.description}</p>
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

      {/* ─────────── What We Provide Section ─────────── */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-4xl font-extrabold text-sage-500 mb-4">
              Comprehensive Mental Health Support
            </h2>
            <p className="text-xl text-sage-400 font-sans leading-relaxed max-w-3xl mx-auto">
              From crisis intervention to daily wellness checks, Slurpy provides a full spectrum 
              of mental health services powered by advanced AI technology.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left side - Services */}
            <motion.div
              className="space-y-8"
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              {services.map((service, i) => (
                <motion.div
                  key={i}
                  className="flex items-start gap-4"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sage-500 to-clay-500 flex items-center justify-center flex-shrink-0">
                    <service.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-lg text-sage-500 mb-2">{service.title}</h3>
                    <p className="text-sage-400 font-sans leading-relaxed text-sm">{service.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Right side - Stats */}
            <motion.div
              className="grid grid-cols-2 gap-6"
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={i}
                  className="text-center p-6 bg-gradient-to-br from-sand-100 to-sage-50 rounded-2xl border border-sand-200"
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-3xl font-display font-bold text-sage-500 mb-2">{stat.number}</div>
                  <div className="text-sm font-sans text-sage-400">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─────────── How It Works ─────────── */}
      <section id="how-it-works" className="container mx-auto px-6 py-24">
        <div className="max-w-7xl mx-auto">
          <motion.h2
            className="font-display text-4xl text-center text-sage-500 mb-16 font-extrabold"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            How It Works
          </motion.h2>

          <div className="space-y-12">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-8 max-w-4xl mx-auto"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: i * 0.2 }}
                viewport={{ once: true }}
              >
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-sage-500 text-white flex items-center justify-center font-display font-bold text-xl">
                  {step.step}
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-semibold text-2xl text-sage-500 mb-3">
                    {step.title}
                  </h3>
                  <p className="text-sage-400 font-sans leading-relaxed text-lg">
                    {step.description}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <step.icon className="w-10 h-10 text-sage-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Medical Disclaimer ─────────── */}
      <section className="container mx-auto px-6 py-16">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="bg-gradient-to-r from-sand-100 to-sage-50 rounded-3xl p-8 border border-sand-200"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="flex items-start gap-4">
              <Award className="w-8 h-8 text-sage-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-display font-semibold text-xl text-sage-500 mb-3">
                  Professional Mental Health Support
                </h3>
                <p className="text-sage-400 font-sans leading-relaxed">
                  Slurpy is designed to complement, not replace, professional mental health care. 
                  While our AI provides evidence-based therapeutic support and emotional guidance, 
                  we always recommend consulting with licensed mental health professionals for 
                  comprehensive treatment. In crisis situations, please contact emergency services 
                  or crisis hotlines immediately.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─────────── CTA Strip ─────────── */}
      <section className="py-24 bg-sage-100">
        <div className="container mx-auto px-6 text-center">
          <div className="max-w-7xl mx-auto">
            <motion.h2
              className="font-display font-bold text-4xl text-sage-500 mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              Ready for a calmer mind?
            </motion.h2>
            <motion.p
              className="text-xl text-sage-400 font-sans mb-8 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              viewport={{ once: true }}
            >
              Join thousands who've found peace, clarity, and support through Slurpy's 
              AI-powered mental health companion.
            </motion.p>
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
        </div>
      </section>

      {/* ─────────── Footer ─────────── */}
      <footer className="bg-sand-200 py-12">
        <div className="container mx-auto px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="font-display font-bold text-2xl text-sage-500 mb-2">Slurpy</h3>
                <p className="text-sage-400 text-sm">© 2024 Slurpy. All rights reserved.</p>
              </div>
              <div className="flex items-center justify-start md:justify-end gap-6">
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