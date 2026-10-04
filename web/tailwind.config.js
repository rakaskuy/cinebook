/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        glacier: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
          950: '#082F49',
          ice: '#F0F8FF',
          frost: '#EBF4FF',
          crystal: '#CBE5FF',
          cyan: '#00F0FF',
          deep: '#0369A1',
          navy: '#082F49',
          aurora: '#818CF8',
          mint: '#2DD4BF',
        },
        memphis: {
          // Re-mapped to icy Glacifest color spectrum for 100% component compatibility
          yellow: '#38BDF8', // Glacial Bright Cyan
          pink: '#0284C7',   // Arctic Royal Blue
          cyan: '#00F0FF',   // Pure Glacial Cyan
          purple: '#6366F1', // Aurora Borealis Indigo
          green: '#2DD4BF',  // Frost Mint Ice
          orange: '#38BDF8', // Cyan Light
          blue: '#0284C7',   // Deep Ice Blue
          dark: '#082F49',   // Sub-Zero Deep Glacier Navy (crisp frost borders)
          paper: '#F0F7FF',  // Glacier Frost Ice Background
          surface: '#FFFFFF',
          muted: '#E0F2FE',  // Crystal Ice Tint
        },
      },
      boxShadow: {
        'hard-sm': '2px 2px 0px #082F49',
        'hard': '4px 4px 0px #082F49',
        'hard-md': '6px 6px 0px #082F49',
        'hard-lg': '8px 8px 0px #082F49',
        'hard-xl': '12px 12px 0px #082F49',
        'frost-glow': '0 0 25px rgba(56, 189, 248, 0.4)',
        'frost-card': '0 8px 30px rgba(8, 47, 73, 0.08)',
        'crystal': 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 8px 24px rgba(8, 47, 73, 0.1)',
      },
      borderWidth: {
        '3': '3px',
        '5': '5px',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        display: ['Newsreader', 'Georgia', 'serif'],
      },
      animation: {
        'float-slow': 'float 6s ease-in-out infinite',
        'float-reverse': 'floatRev 7s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'spin-slow': 'spin 9s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-10px) rotate(3deg)' },
        },
        floatRev: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(12px) rotate(-4deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4', filter: 'blur(20px)' },
          '50%': { opacity: '0.8', filter: 'blur(30px)' },
        },
      },
    },
  },
  plugins: [],
};
