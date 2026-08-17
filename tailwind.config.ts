import type { Config } from "tailwindcss";

/**
 * Theme maps the CSS-variable token layer (src/app/globals.css) so the Flow
 * redesign can use utilities instead of inline styles. The vars stay the single
 * source of truth — these just expose them to Tailwind (redesign §02 §3.9).
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--bg-surface)",
        app: "var(--bg-app)",
        subtle: "var(--bg-subtle)",
        sunken: "var(--bg-sunken)",
        border: { DEFAULT: "var(--border)", strong: "var(--border-strong)" },
        fg: {
          DEFAULT: "var(--fg-primary)",
          secondary: "var(--fg-secondary)",
          muted: "var(--fg-muted)",
          dim: "var(--fg-dim)",
        },
        brand: {
          DEFAULT: "var(--c-brand)",
          strong: "var(--c-brand-strong)",
          vivid: "var(--c-brand-vivid)",
          50: "var(--c-brand-50)",
          100: "var(--c-brand-100)",
        },
        success: { DEFAULT: "var(--c-success)", 50: "var(--c-success-50)" },
        danger: { DEFAULT: "var(--c-danger)", 50: "var(--c-danger-50)" },
        warning: { DEFAULT: "var(--c-warning)", 50: "var(--c-warning-50)" },
        info: { DEFAULT: "var(--c-info)", 50: "var(--c-info-50)" },
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        1: "var(--elev-1)",
        2: "var(--elev-2)",
        3: "var(--elev-3)",
        4: "var(--elev-4)",
        focus: "var(--ring-focus)",
      },
      fontFamily: { sans: "var(--font-sans)", mono: "var(--font-mono)" },
      fontSize: {
        "2xs": ["11px", { lineHeight: "1.4" }],
        xs: ["12px", { lineHeight: "1.45" }],
        sm: ["13px", { lineHeight: "1.5" }],
        base: ["14px", { lineHeight: "1.5" }],
        lg: ["16px", { lineHeight: "1.4" }],
        xl: ["20px", { lineHeight: "1.3" }],
        "2xl": ["24px", { lineHeight: "1.25" }],
      },
      spacing: {
        0.5: "2px", 1: "4px", 1.5: "6px", 2: "8px", 3: "12px", 4: "16px",
        5: "20px", 6: "24px", 8: "32px", 10: "40px", 12: "48px", 16: "64px",
      },
      transitionDuration: { fast: "120ms", base: "180ms", slow: "240ms" },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        in: "var(--ease-in)",
      },
    },
  },
  plugins: [],
};

export default config;
