import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        void: {
          950: '#05040a',
          900: '#08060f',
          850: '#0b0817',
          800: '#0f0b1e',
          700: '#161029',
          600: '#1e1736',
        },
        jasfer: {
          50: '#f6f1ff',
          100: '#ece1ff',
          200: '#d9c4ff',
          300: '#c39bff',
          400: '#a970ff',
          500: '#8b45f7',
          600: '#7326e0',
          700: '#5c1ab4',
          800: '#431485',
          900: '#2c0e58',
          950: '#180734',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px -12px rgba(139, 69, 247, 0.65)',
        'glow-lg': '0 0 90px -20px rgba(139, 69, 247, 0.75)',
        card: '0 20px 50px -30px rgba(0, 0, 0, 0.9)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, rgba(139,69,247,0.14), transparent 65%), radial-gradient(circle at 50% 0%, rgba(139,69,247,0.22), transparent 60%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.06)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.6s ease-out both',
        float: 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 4s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        marquee: 'marquee 28s linear infinite',
        blink: 'blink 1.1s step-end infinite',
      },
    },
  },
  plugins: [],
};

export default config;
