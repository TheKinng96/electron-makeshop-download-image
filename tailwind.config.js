/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['emerald', 'night'],
    darkTheme: 'night',
    darkMode: ['selector', '[data-theme="night"]'],
  },
};
