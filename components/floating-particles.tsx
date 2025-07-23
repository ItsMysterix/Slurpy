// components/floating-particles.tsx
'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'

export default function FloatingParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 12 + Math.random() * 8,
      })),
    [] // constant per browser session
  )

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-2 h-2 bg-sage-300/20 rounded-full blur-sm"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [-10, 10, -10] }}
          transition={{ repeat: Infinity, duration: p.duration, delay: p.delay }}
        />
      ))}
    </div>
  )
}
