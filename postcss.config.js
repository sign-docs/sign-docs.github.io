export default {
  plugins: {
    '@tailwindcss/postcss': {
      // Explicitly tell Tailwind v4 where to scan for class names
      content: ['./index.html', './**/*.{js,jsx,ts,tsx,html}'],
    },
    autoprefixer: {},
  },
};
