import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        display: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
      },
      colors: {
        forest: '#1A6B3C',
        gold: '#C8962A',
        jungle: '#0c1a0f',
        'jungle-2': '#111f14',
        'jungle-3': '#162619',
        'forest-light': '#2a8a50',
        'forest-bright': '#22c55e',
        'forest-dark': '#0f3d20',
        'gold-light': '#e6b044',
        'gold-dark': '#a67a1e',
        'surface-1': 'rgba(255,255,255,0.03)',
        'surface-2': 'rgba(255,255,255,0.06)',
        'surface-3': 'rgba(255,255,255,0.09)',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #a67a1e 0%, #C8962A 50%, #e6b044 100%)',
        'forest-gradient': 'linear-gradient(135deg, #0f3d20 0%, #1A6B3C 100%)',
        'hero-gradient': 'linear-gradient(180deg, #030806 0%, #071209 30%, #0c1a0f 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(26,107,60,0.12) 0%, rgba(0,0,0,0) 100%)',
      },
      animation: {
        'pulse-slow': 'pulseSlow 4s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer-text': 'shimmerText 3s linear infinite',
        'draw-line': 'drawLine 2s ease forwards',
        'fade-up': 'fadeUp 0.5s ease forwards',
        'count-up': 'countUp 0.6s ease forwards',
      },
      keyframes: {
        pulseSlow: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        shimmerText: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        drawLine: {
          from: { strokeDashoffset: '1000' },
          to: { strokeDashoffset: '0' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        countUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        'forest-glow': '0 0 40px rgba(26,107,60,0.35)',
        'gold-glow': '0 0 40px rgba(200,150,42,0.3)',
        'card': '0 8px 32px rgba(0,0,0,0.4)',
        'card-hover': '0 16px 48px rgba(0,0,0,0.5)',
        'nav': '0 4px 30px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
};

export default config;
