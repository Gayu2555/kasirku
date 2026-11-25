/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#f8f4e9',
        card: '#fdfaf2',
        line: '#e6ddc6',
        ink: '#16241d',
        'body-c': '#4a554d',
        muted: '#8a948c',
        green: '#1e5b4a',
        'green-deep': '#143d31',
        cream: '#f7f3e8',
        hover: '#efe8d8',
        solid: '#1e5b4a',
        'shadow-c': 'rgba(22, 36, 29, 0.06)',
        red: '#a2402f',
        'red-bg': '#f7e3e0',
        ok: '#2c6e49',
        'ok-bg': '#e2ecdf',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        'card': '0 1px 3px var(--shadow-c, rgba(22, 36, 29, 0.06))',
      },
    },
  },
  plugins: [],
}