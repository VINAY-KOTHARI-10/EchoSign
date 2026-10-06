import Logo from '@/components/Logo';

export default function SiteFooter({ locale = 'en', dict }) {
  return (
    <footer className="footer">
      <div className="container row between wrap"><Logo href={`/${locale}`} /><span>© {new Date().getFullYear()} {dict.meta.siteName}</span></div>
    </footer>
  );
}
