import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#07080c',
          900: '#0b0d13',
          850: '#10131b',
          800: '#151924',
          750: '#1b2030',
          700: '#232939',
          600: '#323a4f',
        },
        ink: {
          DEFAULT: '#e8ecf5',
          muted: '#98a2b7',
        },
        brand: {
          50: '#eef4ff',
          300: '#8fb4ff',
          400: '#6d97ff',
          500: '#4f7cff',
          600: '#3b62e6',
          700: '#2f4dbd',
        },
        good: '#34d399',
        warn: '#fbbf24',
        bad: '#f87171',
        info: '#38bdf8',
        yt: '#ff4d4f',
        tt: '#22d3ee',
        sh: '#a78bfa',
        tw: '#a970ff',
        kk: '#53fc18',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { xl2: '1rem' },
    },
  },
  plugins: [],
};

export default config;
