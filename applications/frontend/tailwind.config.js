/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      // Semantic colours used by the shadcn components in components/ui. Concrete hex values
      // (matching the green/gray palette the app uses) so opacity modifiers like bg-primary/90 work.
      colors: {
        border: "#e5e7eb",
        input: "#d1d5db",
        "input-background": "#ffffff",
        ring: "#22c55e",
        background: "#ffffff",
        foreground: "#1f2937",
        primary: { DEFAULT: "#16a34a", foreground: "#ffffff" },
        secondary: { DEFAULT: "#f3f4f6", foreground: "#1f2937" },
        destructive: { DEFAULT: "#dc2626", foreground: "#ffffff" },
        muted: { DEFAULT: "#f3f4f6", foreground: "#6b7280" },
        accent: { DEFAULT: "#f0fdf4", foreground: "#15803d" },
        popover: { DEFAULT: "#ffffff", foreground: "#1f2937" },
        card: { DEFAULT: "#ffffff", foreground: "#1f2937" },
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    ({ addUtilities }) => {
      addUtilities({
        ".outline-hidden": { outline: "2px solid transparent", "outline-offset": "2px" },
      });
    },
  ],
};
