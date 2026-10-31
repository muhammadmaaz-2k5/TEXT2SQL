/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../../datapilot-assets/config/tailwind.preset.js')],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

