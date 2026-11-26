// Layout shared by the public pages: header, page content, footer.
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { getDictionary } from '@/i18n/get-dictionary';

export default async function PublicLayout({ children, params }) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="content">{children}</main>
      <SiteFooter locale={locale} dict={dict} />
    </>
  );
}
