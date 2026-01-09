/** @type {import('tailwindcss').Config} */
module.exports = {
  // Dark mode uses 'class' strategy (we manually add 'dark' class to <html>)
  darkMode: 'class',
  
  // Tell Tailwind where to look for classes
  content: [
    "./src/**/*.{ts,tsx,html}",
    "./popup.html"
  ],
  
  theme: {
    extend: {
      // Custom color palette (black & white design system)
      colors: {
        // Background colors
        'background-primary': '#0A0A0A',   // Near black background
        'background-surface': '#1A1A1A',   // Card/surface backgrounds
        'background-hover': '#2A2A2A',     // Hover states
        
        // Border colors
        'border-default': '#2A2A2A',       // Subtle dividers
        'border-accent': '#404040',        // Emphasized borders
        
        // Text colors
        'text-primary': '#FFFFFF',         // Main text (white)
        'text-secondary': '#A0A0A0',       // Secondary text (gray)
        'text-tertiary': '#666666',        // Subtle text (darker gray)
        
        // Accent colors (for CTAs, status, etc.)
        'accent-blue': '#3B82F6',          // Links, CTAs
        'accent-green': '#10B981',         // Success states
        'accent-orange': '#F59E0B',        // Warnings
        'accent-red': '#EF4444',           // Errors, delete actions
      },
      
      // Typography (system fonts for native feel)
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      
      // Custom spacing (for consistent layouts)
      spacing: {
        '72': '18rem',
        '84': '21rem',
        '96': '24rem',
      },
      
      // Animation durations
      transitionDuration: {
        '0': '0ms',
        '250': '250ms',
        '350': '350ms',
      },
      
      // Custom border radius
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  
  plugins: [],
}
