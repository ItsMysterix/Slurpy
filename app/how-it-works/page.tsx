// app/how-it-works/page.tsx
"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  ArrowRight,
  Database,
  Mic,
  Sparkles,
  Shield,
  Brain,
  Zap,
} from "lucide-react"

// Floating leaves background (stable across renders)
function FloatingLeaves() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 15 + Math.random() * 10,
        size: 0.3 + Math.random() * 0.7,
      })),
    []
  )

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {leaves.map((leaf) => (
        <motion.div
          key={leaf.id}
          className="absolute opacity-30"
          style={{ left: `${leaf.x}%`, top: `${leaf.y}%` }}
          animate={{
            y: [0, -30, -10, -40, 0],
            x: [0, 15, -10, 20, 0],
            rotate: [0, 180, 360],
            opacity: [0.1, 0.3, 0.2, 0.4, 0.1],
          }}
          transition={{
            duration: leaf.duration,
            delay: leaf.delay,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        >
          <svg
            width={`${leaf.size * 20}`}
            height={`${leaf.size * 24}`}
            viewBox="0 0 20 24"
            fill="none"
            className="text-sage-300"
            aria-hidden="true"
          >
            <path
              d="M10 0C15 5 20 10 15 20C12.5 22.5 7.5 22.5 5 20C0 10 5 5 10 0Z"
              fill="currentColor"
              fillOpacity="0.6"
            />
            <path d="M10 0L10 20" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.8" />
          </svg>
        </motion.div>
      ))}
    </div>
  )
}

export default function HowItWorksPage() {
  const timelineSteps = [
    {
      icon: Mic,
      title: "Collect",
      description: "We embed your message using MiniLM for semantic understanding.",
      color: "from-sage-500 to-sage-600",
    },
    {
      icon: Database,
      title: "Retrieve & Reason",
      description: "We fetch matching empathetic dialogues and your long-term memory context.",
      color: "from-clay-400 to-sage-400",
    },
    {
      icon: Sparkles,
      title: "Respond",
      description: "GPT-4o generates a grounded, empathetic reply tailored to you.",
      color: "from-sage-500 to-clay-400",
    },
  ]

  const techCards = [
    {
      icon: Zap,
      title: "Retrieval-Augmented Generation",
      description:
        "We combine your input with relevant context from our empathetic dialogue database to keep responses accurate and emotionally appropriate.",
    },
    {
      icon: Brain,
      title: "Emotion Classifier",
      description:
        "A fine-tuned DistilBERT (GoEmotions) maps emotional tone to friendly fruit emojis for a gentle, non-clinical representation.",
    },
    {
      icon: Database,
      title: "Vector Memory (Qdrant Cloud)",
      description:
        "Your personal conversation history is stored as vectors for fast contextual recall while maintaining privacy and security.",
    },
    {
      icon: Shield,
      title: "Privacy & Security",
      description:
        "End-to-end TLS, data never sold or shared. Delete your account and all data anytime with one click.",
    },
  ]

  const faqs = [
    {
      question: "Do you replace therapists?",
      answer:
        "No. Slurpy complements professional care. We’re here for daily emotional support and we encourage seeking professional help when needed.",
    },
    {
      question: "How are my emotions detected?",
      answer:
        "We use a fine-tuned DistilBERT model trained on the GoEmotions dataset to classify emotional states from your text.",
    },
    {
      question: "Can I delete my data?",
      answer:
        "Yes. You can delete individual conversations, clear memory, or delete your entire account and all data at any time.",
    },
    {
      question: "What if I mention self-harm?",
      answer:
        "Slurpy is trained to surface crisis resources and hotline information. We’re not a substitute for emergency services.",
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-sage-100 via-sand-200/60 to-sage-200/40">
      {/* Hero */}
      <section className="relative py-20 px-4">
        <FloatingLeaves />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.h1
            className="font-display text-4xl sm:text-5xl text-sage-600 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            How does Slurpy keep you heard and safe?
          </motion.h1>

          <motion.p
            className="max-w-2xl mx-auto text-sage-500 text-lg font-sans mt-4 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Behind every empathetic response is a carefully designed system that prioritizes your emotional
            wellbeing, privacy, and safety.
          </motion.p>
        </div>
      </section>

      {/* Three-Step Timeline */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="flex lg:flex-row flex-col items-start justify-center gap-12 lg:gap-16"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            {timelineSteps.map((step) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="flex flex-col items-center text-center w-full lg:w-80 min-h-[200px]">
                  <div
                    className={`w-16 h-16 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center mb-4 shadow-lg`}
                  >
                    <Icon className="w-8 h-8 text-white" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-xl text-sage-600 mb-2">{step.title}</h3>
                  <p className="text-sage-500 font-sans text-sm leading-relaxed">{step.description}</p>
                </div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* Under the Hood */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            className="font-display text-3xl text-sage-600 text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            Under the Hood
          </motion.h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {techCards.map((card, index) => {
              const Icon = card.icon
              return (
                <motion.div
                  key={card.title}
                  className="bg-white/70 backdrop-blur-lg border border-sand-200 rounded-3xl p-6 shadow-[0_6px_20px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow duration-300"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ y: -2 }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sage-400 to-sage-500 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg text-sage-600 mb-2">{card.title}</h3>
                      <p className="text-sage-500 font-sans text-sm leading-relaxed">{card.description}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.h2
            className="font-display text-3xl text-sage-600 text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            Frequently Asked Questions
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="bg-white/70 backdrop-blur-lg border border-sand-200 rounded-2xl px-6 shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
                >
                  <AccordionTrigger className="font-display text-sage-600 text-left hover:no-underline py-6">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="font-sans text-sage-500 leading-relaxed pb-6">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-20">
        <motion.div
          className="bg-sage-100/60 py-16 px-4 flex flex-col items-center gap-6 rounded-t-3xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-3xl text-sage-600 text-center max-w-2xl">
            Ready to experience empathetic AI?
          </h2>
          <p className="text-sage-500 font-sans text-center max-w-xl">
            Join thousands who have found a safe space to process their thoughts and emotions.
          </p>

          {/* Primary CTA → /sign-up (no more /auth) */}
          <Link href="/sign-up">
            <Button
              className="bg-gradient-to-r from-sage-500 to-sage-400 hover:from-sage-400 hover:to-sage-300 text-white rounded-full px-8 py-3 font-sans font-medium text-lg shadow-lg hover:shadow-xl transition-all duration-200"
              aria-label="Create your Slurpy account"
            >
              Talk to Slurpy
              <ArrowRight className="w-5 h-5 ml-2" aria-hidden="true" />
            </Button>
          </Link>

          {/* Secondary subtle link → /sign-in */}
          <p className="text-sage-500 font-sans text-sm">
            Already have an account?{" "}
            <Link href="/sign-in" className="underline hover:text-sage-600">
              Sign in
            </Link>
          </p>
        </motion.div>
      </section>
    </div>
  )
}
