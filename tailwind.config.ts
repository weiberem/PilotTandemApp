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
        // Skywings brand: amber CTAs on a deep navy frame.
        primary: {
          DEFAULT: '#E08A0B',
          dark: '#C2740A',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#13293D',
          foreground: '#FFFFFF',
        },
        success: '#2F855A',
        warning: '#B45309',
        danger: '#B91C1C',
        bg: {
          DEFAULT: '#F4F6F8',
          card: '#FFFFFF',
          dark: '#13293D',
          subtle: '#E6EBF0',
        },
        text: {
          DEFAULT: '#13293D',
          muted: '#5A6B7B',
        },
        border: '#DDE3EA',
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
