import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "seed-bg-default": "var(--seed-color-bg-layer-default)",
        "seed-bg-fill": "var(--seed-color-bg-layer-fill)",
        "seed-bg-floating": "var(--seed-color-bg-layer-floating)",
        "seed-bg-brand": "var(--seed-color-bg-brand-solid)",
        "seed-bg-brand-weak": "var(--seed-color-bg-brand-weak)",
        "seed-fg-primary": "var(--seed-color-fg-neutral)",
        "seed-fg-muted": "var(--seed-color-fg-neutral-muted)",
        "seed-fg-subtle": "var(--seed-color-fg-neutral-subtle)",
        "seed-fg-brand": "var(--seed-color-fg-brand)",
        "seed-stroke-subtle": "var(--seed-color-stroke-neutral-subtle)",
        "seed-stroke-weak": "var(--seed-color-stroke-neutral-weak)",
        "seed-stroke-brand": "var(--seed-color-stroke-brand-weak)",
        "seed-overlay": "var(--seed-color-bg-overlay)",
      },
      boxShadow: {
        card: "0 12px 30px rgb(0 0 0 / 0.08)",
      },
      keyframes: {
        loading: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(340%)" },
        },
        floating: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        loading: "loading 1.2s ease-in-out infinite",
        floating: "floating 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
