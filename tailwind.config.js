/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: [
    "./app/**/*.{js,jsx,ts,tsx}", 
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: '#FFF8F4',
        'on-background': '#2B1700',
        primary: '#276959',
        'primary-container': '#6FAF9D',
        'on-primary-container': '#004135',
        surface: '#FFF8F4',
        'on-surface': '#2B1700',
        'surface-container-low': '#FFF1E6',
        'surface-container-high': '#FFE3C9',
        'surface-container-highest': '#FFDDBA',
        'on-surface-variant': '#3F4945',
        secondary: '#765B00',
        'secondary-container': '#FECE4B',
        'on-secondary-container': '#725800',
        tertiary: '#A03E40',
        'tertiary-container': '#F68080',
        'on-tertiary-container': '#6E191F',
        'outline-variant': '#BFC9C4',
      },
      fontFamily: {
        headline: ['Manrope', 'sans-serif'],
        body: ['Work Sans', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
