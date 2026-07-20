import type { Config } from 'tailwindcss';

/**
 * Check Point brand theme.
 *
 * - `brand` is Brand Berry (#EE0C5D), the primary accent.
 * - `slate` is intentionally remapped from Tailwind's cold blue-grey to a warm
 *   charcoal derived from Check Point black (#231F20). Existing markup keeps
 *   using `slate-*`, so this single remap re-tones every surface at once.
 * - Semantic tokens (`surface`, `border`, `ink`, `success`…) are driven by CSS
 *   variables declared in globals.css.
 */
const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Check Point Brand Berry — primary accent.
        brand: {
          50: '#fde7ef',
          100: '#fcc7da',
          200: '#f993b5',
          300: '#f65c8e',
          400: '#f22f70',
          500: '#ee0c5d', // Brand Berry — DEFAULT
          600: '#ce0a50',
          700: '#a6083f',
          800: '#7c0730',
          900: '#5e0a2e',
          DEFAULT: '#ee0c5d',
        },
        // Warm charcoal neutral (Check Point black family) replacing cold slate.
        slate: {
          50: '#f8f6f6',
          100: '#efeaeb',
          200: '#ddd5d7',
          300: '#c1b8ba',
          400: '#968d8f',
          500: '#6f6668',
          600: '#4d4547',
          700: '#3a3335',
          800: '#272223',
          900: '#1e1a1b',
          950: '#161314',
        },
        // Semantic tokens (see globals.css for the values).
        ink: 'rgb(var(--ink) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
        },
        hairline: 'rgb(var(--border) / <alpha-value>)',
        success: '#34c98a',
        warning: '#e8a13a',
        danger: '#f04463',
        info: '#6b8afd',
      },
      fontFamily: {
        // DIN Pro is the Check Point brand face (licensed); Barlow is the
        // closest OFL substitute. Swap for a licensed DIN Pro webfont in prod.
        sans: ['var(--font-sans)', 'Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        brand: '0 12px 32px -12px rgba(238, 12, 93, 0.45)',
        card: '0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -16px rgba(0, 0, 0, 0.6)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
