import { ForgotForm } from '@/features/auth/RecoveryForms';
import { getDictionary } from '@/i18n/get-dictionary';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.auth.forgotTitle, robots: { index: false } };
}

export default async function ForgotPasswordPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return <ForgotForm locale={locale} dict={d} />;
}
