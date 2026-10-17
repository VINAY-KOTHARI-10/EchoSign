import { redirect } from 'next/navigation';
import AuthForm from '@/features/auth/AuthForm';
import { getDictionary } from '@/i18n/get-dictionary';
import { getSession } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.auth.signIn, robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }) {
  const { locale } = await params;
  const { next } = await searchParams; // the page the person wanted before being asked to sign in
  const d = await getDictionary(locale);
  if (await getSession()) redirect(`/${locale}/dashboard`); // already signed in
  return <AuthForm mode="login" locale={locale} next={typeof next === 'string' ? next : ''} dict={d} />;
}
