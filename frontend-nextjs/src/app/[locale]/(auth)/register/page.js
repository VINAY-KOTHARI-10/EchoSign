import { redirect } from 'next/navigation';
import AuthForm from '@/features/auth/AuthForm';
import { getDictionary } from '@/i18n/get-dictionary';
import { getSession } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.auth.createAccount, robots: { index: false } };
}

export default async function RegisterPage({ params, searchParams }) {
  const { locale } = await params;
  const { next } = await searchParams;
  const d = await getDictionary(locale);
  if (await getSession()) redirect(`/${locale}/dashboard`);
  return <AuthForm mode="register" locale={locale} next={typeof next === 'string' ? next : ''} dict={d} />;
}
