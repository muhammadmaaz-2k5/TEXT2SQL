/** Tailwind preset: in tailwind.config.js -> presets: [require('./tailwind.preset.js')] */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#EEF3FF',100:'#DCE6FF',200:'#B9CCFF',300:'#8FACFF',400:'#5F83FF',500:'#2F5BFF',600:'#1F44D6',700:'#1834A6',800:'#122778',900:'#0C1A52', DEFAULT:'#2F5BFF' },
        accent: { 300:'#FFD27A',400:'#FFC24D',500:'#FFB020',600:'#E09100', DEFAULT:'#FFB020' },
        navy: { 900:'#0B1220',800:'#121C30',700:'#1A2742',600:'#243049' },
        success:'#12B76A', warning:'#F79009', danger:'#F04438',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"','Inter','system-ui','sans-serif'],
        sans: ['"IBM Plex Sans"','Inter','system-ui','sans-serif'],
        mono: ['"JetBrains Mono"','ui-monospace','Consolas','monospace'],
      },
      borderRadius: { md:'10px', lg:'16px' },
    },
  },
};
