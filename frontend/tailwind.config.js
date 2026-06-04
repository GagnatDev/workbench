/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Visual identity palette (docs/visual-identity.md). Matte natural tones;
      // terracotta marks what's interactive, olive = positive, flax = sparse highlight.
      colors: {
        oatmeal: '#F4F1EA', // base background (60%)
        stoneware: '#E3DFD5', // cards, sheets, inputs
        charcoal: '#5C5A56', // primary text (never pure black)
        'charcoal-muted': '#8A8782', // metadata, captions
        terracotta: '#C87A63', // primary interactive
        olive: '#7A826B', // calm / positive / synced
        flax: '#D9A752', // sparse highlight (favourite, current stage)
        divider: '#D8D4C9', // hairline dividers
        brick: '#A8524A', // error only
      },
      fontFamily: {
        // Editorial serif for titles only; Inter for everything else.
        serif: ['"Playfair Display Variable"', 'Playfair Display', 'serif'],
        sans: [
          '"Inter Variable"',
          'Inter',
          'Helvetica Neue',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
}
