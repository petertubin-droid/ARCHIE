/** ARCHIE PWA Tailwind config. Mirrors the FRELUX
 *  conventions (dark command-centre aesthetic); the premium
 *  design layer lives in src/styles/archie-premium.css.
 *
 *  COLOR TOKENS (visibility fix, Oct 19, 2026): the app shells
 *  use shadcn-style token classes (bg-background, text-foreground,
 *  text-muted-foreground, border-input, bg-primary, ...) that
 *  were never defined here — every one of them silently fell
 *  back to browser defaults (white surfaces, near-invisible
 *  text, invisible inputs). These tokens give every page a
 *  legible dark command-centre palette. */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0B0F14",
        foreground: "#E2E8F0",
        card: "#121821",
        "card-foreground": "#E2E8F0",
        popover: "#121821",
        "popover-foreground": "#E2E8F0",
        primary: "#FBBF24",
        "primary-foreground": "#0B0F14",
        secondary: "#1B2431",
        "secondary-foreground": "#CBD5E1",
        muted: "#141B24",
        "muted-foreground": "#94A3B8",
        accent: "#182230",
        "accent-foreground": "#E2E8F0",
        destructive: "#F87171",
        "destructive-foreground": "#0B0F14",
        border: "#24303F",
        input: "#24303F",
        ring: "#FBBF24",
      },
    },
  },
  plugins: [],
};
