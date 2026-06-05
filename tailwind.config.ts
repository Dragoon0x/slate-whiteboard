import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ink is driven by a CSS variable so every text-ink/NN utility follows
        // the active theme automatically.
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        canvas: '#fbfbfa',
        accent: {
          DEFAULT: '#5B6CFF',
          soft: '#eef0ff',
          ring: 'rgba(91,108,255,0.35)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Geist',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        float: '0 1px 2px rgba(17,17,17,0.04), 0 8px 24px rgba(17,17,17,0.10)',
        panel: '0 1px 2px rgba(17,17,17,0.05), 0 12px 40px rgba(17,17,17,0.14)',
        soft: '0 1px 2px rgba(17,17,17,0.06)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'pop-in': 'pop-in 0.16s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};

export default config;
