/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366F1',
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        income: {
          DEFAULT: '#22C55E',
          bg: '#F0FDF4',
        },
        expense: {
          DEFAULT: '#EF4444',
          bg: '#FEF2F2',
        },
        transfer: {
          DEFAULT: '#3B82F6',
          bg: '#EFF6FF',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: '#FFFBEB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
