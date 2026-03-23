/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme colors
        background: '#0D1117',
        surface: '#161B22',
        surfaceHover: '#21262D',
        border: '#30363D',
        // Primary accent
        primary: '#1A73E8',
        primaryHover: '#1557B0',
        // Text colors
        textPrimary: '#F0F6FC',
        textSecondary: '#8B949E',
        textMuted: '#6E7681',
        // Status colors
        success: '#238636',
        error: '#DA3633',
        warning: '#9E6A03',
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
