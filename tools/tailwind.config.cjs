module.exports = {
  content: { relative: true, files: ['../index.html'] },
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sakura: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e0525c',
          600: '#c83f4a',
          700: '#a93442',
          800: '#8c2f3d',
          900: '#762b38',
          950: '#4c1d27',
        },
        jpdark: {
          800: '#1e1e24',
          900: '#121216',
          950: '#0a0a0d'
        }
      },
      fontFamily: {
        jp: ['"Noto Sans JP"', '"Hiragino Sans"', 'Meiryo', 'sans-serif'],
        sans: ['Inter', 'sans-serif']
      }
    }
  }
};
