// A single lecture (dynamic route). Shown as a full page when opened directly or after a refresh.
// When opened by clicking a link inside the app, the intercepting route in @modal shows the same content as a pop-up instead.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ErrorState } from '@/components/ui';
import LectureNotesView from '@/features/library/LectureNotesView';
import { getLecture } from '@/features/library/data';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireSession } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { code } = await params;
  return { title: String(code).toUpperCase() };
}

export default async function LecturePage({ params }) {
  const { locale, code } = await params;
  const d = await getDictionary(locale);
  const { token } = await requireSession(locale, `/${locale}/lectures/${code}`);
  const lecture = await getLecture(token, code);
  if (lecture.status === 404) notFound();

  return (
    <>
      <Link href={`/${locale}/lectures`} className="btn btn-ghost btn-sm back-link"><ArrowLeft size={16} aria-hidden="true" /> {d.lecture.back}</Link>
      {!lecture.ok
        ? <div className="card"><ErrorState title={d.common.somethingWrong} message={lecture.status === 0 ? d.common.backendDown : lecture.error} /></div>
        : <LectureNotesView lecture={lecture} dict={d} code={code} />}
    </>
  );
}
