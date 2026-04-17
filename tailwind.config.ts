export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#090912', bg2: '#0f0f1a',
        surface: '#14141f', surface2: '#1c1c2c', surface3: '#242436',
        border: '#2a2a3e', border2: '#3a3a54',
        accent: '#00e87a', accent2: '#00b85f',
        spotify: '#1ed760',
        t1: '#ffd60a', t2: '#4cc9f0', t3: '#7c8fa6',
        text: '#f0f0f8', text2: '#8899aa', text3: '#556070',
        danger: '#ff6b6b', warn: '#ffa94d',
      },
      fontFamily: {
        mono:  ['"DM Mono"', 'monospace'],
        serif: ['"Instrument Serif"', 'serif'],
        sans:  ['"DM Sans"', 'sans-serif'],
      },
    },
  },
};
