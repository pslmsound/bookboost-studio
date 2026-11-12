/** BookBoost Studio design tokens. Matte charcoal, ivory, champagne gold, olive gray. */
module.exports = {
  content: [__dirname + '/src/renderer/index.html', __dirname + '/src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0D0D0C',
          900: '#131312',
          850: '#181817',
          800: '#1E1E1C',
          750: '#252523',
          700: '#2D2D2A',
        },
        line: { DEFAULT: '#2B2A27', strong: '#3A3935' },
        ivory: { DEFAULT: '#EFEAE0', dim: '#BDB7AA', mute: '#8F8A7E' },
        gold: { DEFAULT: '#C9AE80', deep: '#A68E62', pale: '#E2D0AC' },
        olive: { DEFAULT: '#8E937B', deep: '#5E6350', pale: '#B4B8A2' },
        ok: '#9DB08A',
        warn: '#D3AC6C',
        danger: '#CF8273',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Segoe UI', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px', letterSpacing: '0.08em' }],
      },
      borderRadius: { card: '10px' },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.02) inset, 0 12px 32px -20px rgba(0,0,0,0.7)',
        modal: '0 30px 80px -20px rgba(0,0,0,0.8)',
      },
    },
  },
  plugins: [],
};
