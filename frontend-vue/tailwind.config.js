/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,vue}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef4ff',
          100: '#dbe8ff',
          200: '#bad2ff',
          300: '#8db4ff',
          400: '#6c9fff',
          500: '#4d8cff',
          600: '#3a74e6',
          700: '#2d5cba',
          800: '#264a8f',
          900: '#223f73',
        },
        dark: {
          50: '#4a5264',
          100: '#2f3646',
          200: '#242936',
          300: '#191d25',
          400: '#14171d',
          500: '#0e1014',
          600: '#0b0d11',
          700: '#090b0e',
          800: '#07080a',
          900: '#040506',
        },
        profit: {
          positive: '#34c27a',
          negative: '#e5594f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
