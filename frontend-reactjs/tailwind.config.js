/** Tailwind CSS for EchoSign (INT252).
 *  - `prefix: 'tw-'` keeps every utility class separate from the app's own CSS classes (.grid, .row, .card ...),
 *    so adding Tailwind cannot change how existing screens look.
 *  - `preflight: false` leaves out Tailwind's global reset for the same reason.
 *  - Colours point at the app's CSS variables, so Tailwind pieces follow light, dark and high-contrast themes. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  prefix: 'tw-',
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        brand: 'var(--violet)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        surface: 'var(--surface)',
        ok: 'var(--go, #0f9d58)',
      },
      screens: { xs: '480px' },
    },
  },
  plugins: [],
};
