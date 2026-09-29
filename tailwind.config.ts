import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#0f766e",
        "accent-fg": "#ffffff",
        surface: "#ffffff",
        canvas: "#fafaf9",
        "canvas-2": "#f4f4f2",
        ink: "#111827",
        muted: "#6b7280",
        border: "#e5e7eb",
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
      },
    },
  },
  plugins: [],
} satisfies Config;
