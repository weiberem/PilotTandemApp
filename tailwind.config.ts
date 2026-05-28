import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0EA5E9',
          dark: '#0284C7',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#F97316',
          foreground: '#FFFFFF',
        },
        success: '#22C55E',
        warning: '#EAB308',
        danger: '#EF4444',
        bg: {
          DEFAULT: '#F8FAFC',
          card: '#FFFFFF',
          dark: '#0F172A',
        },
        text: {
          DEFAULT: '#0F172A',
          muted: '#64748B',
        },
        border: '#E2E8F0',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      minHeight: {
        tap: '48px',
      },
      minWidth: {
        tap: '48px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
