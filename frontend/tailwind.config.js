/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Green accent from the redesign mockups (replaces the former blue primary).
        primary: {
          50: '#e9fbf2',
          100: '#c6f4de',
          200: '#98e8c2',
          300: '#6fdba6',
          400: '#4ccf8f',
          500: '#34c27a',
          600: '#2aa566',
          700: '#1f8250',
          800: '#175f3b',
          900: '#0f3d26',
        },
        // Surfaces: 500 page, 600 header/inset, 400 card, 300 raised, 200 border, 100 strong border.
        dark: {
          50: '#4a5264',
          100: '#3a4150',
          200: '#262b34',
          300: '#1b1f26',
          400: '#15181d',
          500: '#0f1114',
          600: '#12151a',
          700: '#0b0d10',
          800: '#07080a',
          900: '#040506',
        },
        onprimary: '#04140c',
        info: '#7aa7ff',
        gray: {
          50: '#f7f6f2',
          100: '#f3f1ec',
          200: '#eceae5',
          300: '#c4c6cd',
          400: '#a7aab3',
          500: '#8b8f99',
          600: '#6b7080',
          700: '#3a4150',
          800: '#262b34',
          900: '#15181d',
        },
        profit: {
          positive: '#3fd49a',
          negative: '#ff7a6b',
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
