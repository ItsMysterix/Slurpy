"use client"

import { motion } from "framer-motion"

export function FloatingLeaves() {
  const leaves = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 12 + Math.random() * 8,
    size: 0.5 + Math.random() * 1,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {leaves.map((leaf) => (
        <motion.div
          key={leaf.id}
          className="absolute opacity-20"
          style={{
            left: `${leaf.x}%`,
            top: `${leaf.y}%`,
          }}
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
            width={`${leaf.size * 16}`}
            height={`${leaf.size * 20}`}
            viewBox="0 0 16 20"
            fill="none"
            className="text-sage-300"
          >
            <path d="M8 0C12 4 16 8 12 16C10 18 6 18 4 16C0 8 4 4 8 0Z" fill="currentColor" fillOpacity="0.6" />
            <path d="M8 0L8 16" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.8" />
          </svg>
        </motion.div>
      ))}
    </div>
  )
}
