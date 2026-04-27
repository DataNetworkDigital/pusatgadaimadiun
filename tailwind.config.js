/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Redesign tokens — Buku Tabungan
        cream: { DEFAULT: '#F8F1E2', deep: '#F0E6D0' },
        paper: '#FFFCF5',
        ink: { DEFAULT: '#2A1F14', soft: '#5C4A37', mute: '#8B7558' },
        line: { DEFAULT: '#E5D8BD', soft: '#EFE5CD' },
        indigo: { DEFAULT: '#2D4A6B', soft: '#E5EBF2', deep: '#1F3550' },
        daun: { DEFAULT: '#5C8A4E', soft: '#E8F0E0' },
        terra: { DEFAULT: '#B85450', soft: '#F5E4E2' },
        langit: { DEFAULT: '#4A7BA0', soft: '#E4ECF3' },
        emas: { DEFAULT: '#C9952F', soft: '#F7EED8' },
        kayu: '#8B6F47',

        // Legacy tokens — kept until all screens migrate
        primary: {
          DEFAULT: '#6366F1',
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        income: { DEFAULT: '#22C55E', bg: '#F0FDF4' },
        expense: { DEFAULT: '#EF4444', bg: '#FEF2F2' },
        transfer: { DEFAULT: '#3B82F6', bg: '#EFF6FF' },
        warning: { DEFAULT: '#F59E0B', bg: '#FFFBEB' },
      },
      fontFamily: {
        display: ['Fraunces', 'Cambria', 'Georgia', 'serif'],
        sans: ['-apple-system', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
        num: ['Fraunces', 'Cambria', 'Georgia', 'serif'],
      },
      borderRadius: {
        '2xl': '18px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(140,110,60,0.04), 0 2px 6px rgba(140,110,60,0.05)',
        hero: '0 4px 14px rgba(45,74,107,0.22)',
        cta: '0 4px 12px rgba(45,74,107,0.25)',
        toast: '0 8px 24px rgba(0,0,0,0.35)',
        sheet: '0 -8px 24px rgba(0,0,0,0.15)',
      },
    },
  },
  plugins: [],
};
