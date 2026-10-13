/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' lets the app switch between light and dark itself (Profile > App
  // Appearance) instead of only following the phone's setting.
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", 
    "./components/**/*.{js,jsx,ts,tsx}", 
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./navigator/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};