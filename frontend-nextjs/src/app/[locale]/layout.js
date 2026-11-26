// The root layout. It lives inside [locale], so every page below knows its language (/en, /hi, /es).
import { Inter, JetBrains_Mono, Manrope } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import WebVitals from '@/components/WebVitals';
import { env } from '@/lib/env';
import { themeInitScript } from '@/lib/theme-init';
import { getDictionary } from '@/i18n/get-dictionary';
import { hasLocale, locales } from '@/i18n/config';
// The same stylesheets as the EchoSign React app, in the same order, so both sites look the same.
import '@/styles/global.css';
import '@/styles/design.css';
import '@/styles/pages.css';
import '@/styles/theme.css';
import '@/styles/premium.css';
import '@/styles/next.css';

// next/font downloads the fonts at build time and serves them from this site: no layout shift, no third-party request.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

// SSG: one static copy of every page per language is built ahead of time.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Metadata API (SEO): the title, description, language alternates and share preview for every page below.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
    title: { default: dict.meta.siteName, template: `%s · ${dict.meta.siteName}` },
    description: dict.meta.description,
    alternates: { canonical: `/${locale}`, languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])) },
    openGraph: { title: dict.meta.siteName, description: dict.meta.description, type: 'website', locale, siteName: dict.meta.siteName },
    robots: { index: true, follow: true },
  };
}

export const viewport = { themeColor: '#5b3df5', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  return (
    // suppressHydrationWarning: the theme script changes data-theme before React starts, which is intended.
    <html lang={locale} className={`${inter.variable} ${manrope.variable} ${mono.variable}`} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <WebVitals />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
