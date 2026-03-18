/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cardboard: "#966F33",
        safetyOrange: "#FF6600",
        terminalGreen: "#00FF41",
        // Extra "ink" tones for contrast around the editor while keeping your palette primary.
        ink: "#140B06",
        ink2: "#0B0704"
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace"
        ]
      }
    }
  },
  plugins: []
};

