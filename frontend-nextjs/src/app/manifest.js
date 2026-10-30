// Web app manifest: lets the site be installed on a phone's home screen.
export default function manifest() {
  return {
    name: 'EchoSign Next',
    short_name: 'EchoSign',
    description: 'Sign-language dictionary, lecture notes and study notes.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#5b3df5',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
