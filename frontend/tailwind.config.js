/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'web3-card': '#1F2833',
        'web3-accent': '#66FCF1',
        'web3-purple': '#8B5CF6',
        'web3-success': '#10B981',
        'web3-gold': '#F59E0B',
        'web3-danger': '#EF4444',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'gradient': 'gradient 8s ease infinite',
        'float': 'float 30s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'loading-bar': 'loadingBar 1.8s ease-in-out infinite',
        'scale-in': 'scaleIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        loadingBar: {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.85)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
          '33%': { transform: 'translate(30px, -30px) rotate(120deg)' },
          '66%': { transform: 'translate(-20px, 20px) rotate(240deg)' },
        },
      },
      backgroundSize: {
        '200': '200% 200%',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
