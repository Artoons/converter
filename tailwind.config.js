/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        board: 'rgb(var(--c-board) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        subtle: 'rgb(var(--c-subtle) / <alpha-value>)',
        chalk: 'rgb(var(--c-chalk) / <alpha-value>)',
        sketch: 'rgb(var(--c-sketch) / <alpha-value>)',
        crimson: '#E63946',
        crimsonDark: '#9B2226',
        // Semantic aliases used across modals
        ink: 'rgb(var(--c-chalk) / <alpha-value>)',
        paper: 'rgb(var(--c-canvas) / <alpha-value>)',
        panel: 'rgb(var(--c-surface) / <alpha-value>)',
        muted: 'rgb(var(--c-sketch) / <alpha-value>)',
        line: 'rgb(var(--c-chalk) / <alpha-value>)',
        sun: '#E63946',
        bubble: '#E63946',
        sky: '#E63946',
        mint: '#E63946',
        grape: 'rgb(var(--c-sketch) / <alpha-value>)',
        tomato: '#E63946',
      },
      fontFamily: {
        display: ['"Cabin Sketch"', 'system-ui', 'sans-serif'],
        hand: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        tag: ['ui-monospace', '"Cascadia Mono"', 'monospace'],
        mono: ['ui-monospace', '"Cascadia Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
