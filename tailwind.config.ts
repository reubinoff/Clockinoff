import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#6d28d9",
        "accent-fg": "#ffffff",
        "accent-soft": "#ede9fe",
        surface: "#ffffff",
        canvas: "#fafaf9",
        "canvas-2": "#f4f4f2",
        ink: "#111827",
        muted: "#6b7280",
        border: "#e5e7eb",
        danger: "#b91c1c",
        "danger-soft": "#fef2f2",
      },
      fontFamily: {
        sans: [
          "InterVariable",
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(17,24,39,0.04), 0 1px 3px rgba(17,24,39,0.05)",
        "card-lg":
          "0 1px 2px rgba(17,24,39,0.04), 0 12px 32px rgba(17,24,39,0.06)",
      },
      borderRadius: {
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
