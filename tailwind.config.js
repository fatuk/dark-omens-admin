/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0b14',
        panel: '#15121f',
        panel2: '#1c1830',
        line: '#3a2f1a',       // = бывш. --border
        text: '#d7cfbe',
        muted: '#8a8174',
        gold: '#c7a84a',
        green: '#4db870',
        danger: '#c8643a',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
