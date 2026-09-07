/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#FFFFFF',
        ink: '#000000',
        muted: '#6F6F6F',
        gold: '#F59E0B',
        navy: '#1E3A8A',
        royal: '#2563EB',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: { '7xl': '80rem' },
    },
  },
  plugins: [],
};
