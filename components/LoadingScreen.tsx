'use client'

import { motion } from 'framer-motion'

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-hive-dark">
      {/* Background glow */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% 50%, rgba(244, 180, 0, 0.1) 0%, transparent 50%)
          `,
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative text-center"
      >
        {/* Animated logo */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          className="w-24 h-24 mx-auto mb-6 relative"
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Outer hexagon */}
            <motion.polygon
              points="50,5 93,27.5 93,72.5 50,95 7,72.5 7,27.5"
              fill="none"
              stroke="#F4B400"
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, ease: 'easeInOut' }}
            />
            {/* Inner hexagon */}
            <motion.polygon
              points="50,25 75,37.5 75,62.5 50,75 25,62.5 25,37.5"
              fill="none"
              stroke="#FFB800"
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, delay: 0.5, ease: 'easeInOut' }}
            />
            {/* Center circle */}
            <motion.circle
              cx="50"
              cy="50"
              r="10"
              fill="#F4B400"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
            />
          </svg>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-display font-bold text-gradient-gold mb-2"
        >
          HiveLink
        </motion.h1>

        {/* Loading text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-gray-400"
        >
          Loading puzzle...
        </motion.p>

        {/* Loading dots */}
        <div className="flex justify-center gap-1 mt-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-hive-yellow"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

