/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../../packages/ui/config/tailwind.preset.js')],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

