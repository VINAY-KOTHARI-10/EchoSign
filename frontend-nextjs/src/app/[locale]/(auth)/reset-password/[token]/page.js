import { ResetForm } from '@/features/auth/RecoveryForms';
import { getDictionary } from '@/i18n/get-dictionary';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.auth.resetTitle, robots: { index: false } };
}

export default async function ResetPasswordPage({ params }) {
  const { locale, token } = await params;
  const d = await getDictionary(locale);
  return <ResetForm locale={locale} token={token} dict={d} />;
}
