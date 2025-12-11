import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        hive: {
          yellow: '#F4B400',
          gold: '#FFB800',
          amber: '#E6A100',
          honey: '#D4A000',
          dark: '#0D0D0D',
          charcoal: '#1A1A1A',
          graphite: '#2A2A2A',
          slate: '#3A3A3A',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'hive-glow': '0 0 20px rgba(244, 180, 0, 0.3)',
        'hive-glow-lg': '0 0 40px rgba(244, 180, 0, 0.4)',
        'hive-glow-xl': '0 0 60px rgba(244, 180, 0, 0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(244, 180, 0, 0.3)' },
          '100%': { boxShadow: '0 0 30px rgba(244, 180, 0, 0.6)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hive-gradient': 'linear-gradient(135deg, #1A1A1A 0%, #0D0D0D 100%)',
      },
    },
  },
  plugins: [],
}

export default config

