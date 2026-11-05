/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F6F8FC',
        surface: '#FFFFFF',
        sidebar: {
          DEFAULT: '#111827',
          hover: '#1F2937',
          border: '#1E293B',
          text: '#94A3B8',
          active: '#5146E5',
          activeText: '#FFFFFF',
        },
        primary: {
          DEFAULT: '#5146E5',
          hover: '#4338CA',
          light: '#EEEDFF',
        },
        success: {
          DEFAULT: '#139B76',
          bg: '#E8F7F1',
          text: '#0D684F',
        },
        warning: {
          DEFAULT: '#D99124',
          bg: '#FFF5E5',
          text: '#925B0E',
        },
        danger: {
          DEFAULT: '#DC5555',
          bg: '#FDECEC',
          text: '#9E2B2B',
        },
        neutral: {
          primary: '#172033',
          secondary: '#667085',
          muted: '#98A2B3',
          border: '#E8ECF2',
          light: '#F8FAFC',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(16, 24, 40, 0.05)',
        'card': '0 1px 3px 0 rgba(16, 24, 40, 0.06), 0 1px 2px 0 rgba(16, 24, 40, 0.04)',
        'elevated': '0 4px 12px 0 rgba(16, 24, 40, 0.08), 0 2px 4px 0 rgba(16, 24, 40, 0.04)',
        'drawer': '-4px 0 24px 0 rgba(16, 24, 40, 0.12)',
      },
      borderRadius: {
        'card': '10px',
        'badge': '6px',
      }
    },
  },
  plugins: [],
};
