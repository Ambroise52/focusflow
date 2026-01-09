/**
 * PostCSS Configuration for FocusFlow Extension
 * 
 * This configuration enables Tailwind CSS processing and automatic
 * vendor prefixing for cross-browser compatibility.
 * 
 * Plugins:
 * - tailwindcss: Processes Tailwind utility classes into CSS
 * - autoprefixer: Adds browser-specific prefixes automatically
 */

module.exports = {
  plugins: {
    // Process Tailwind CSS utility classes
    tailwindcss: {},
    
    // Add vendor prefixes for better browser compatibility
    // Targets last 2 versions of major browsers automatically
    autoprefixer: {},
  },
};
