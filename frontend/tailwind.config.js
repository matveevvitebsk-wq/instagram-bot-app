/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Цвета адаптированы к Telegram тёмной/светлой теме
        tg: {
          bg: "var(--tg-theme-bg-color, #ffffff)",
          text: "var(--tg-theme-text-color, #000000)",
          hint: "var(--tg-theme-hint-color, #708499)",
          link: "var(--tg-theme-link-color, #2678b6)",
          button: "var(--tg-theme-button-color, #2678b6)",
          "button-text": "var(--tg-theme-button-text-color, #ffffff)",
          secondary: "var(--tg-theme-secondary-bg-color, #f0f0f0)",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      screens: {
        xs: "360px",   // Маленькие смартфоны
        sm: "480px",
        md: "768px",   // Планшеты
        lg: "1024px",  // Десктоп
      },
    },
  },
  plugins: [],
};
