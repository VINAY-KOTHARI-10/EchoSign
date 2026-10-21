// INTERCEPTING ROUTE. "(.)library/[code]" catches navigations to /library/[code] that happen INSIDE the app (a link click)
// and shows the lecture as a pop-up over the library list. A direct visit or a refresh shows the full page instead
// (library/[code]/page.js). Same address, two presentations.
import LectureNotesView from '@/features/library/LectureNotesView';
import { getLecture } from '@/features/library/data';
import { ErrorState } from '@/components/ui';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireSession } from '@/lib/session';
import Modal from '@/components/Modal';

export default async function LectureModal({ params }) {
  const { locale, code } = await params;
  const d = await getDictionary(locale);
  const { token } = await requireSession(locale, `/${locale}/library/${code}`);
  const lecture = await getLecture(token, code);

  return (
    <Modal closeLabel={d.lecture.close}>
      {!lecture.ok
        ? <ErrorState title={d.common.somethingWrong} message={lecture.status === 0 ? d.common.backendDown : lecture.error} />
        : <LectureNotesView lecture={lecture} dict={d} code={code} />}
    </Modal>
  );
}
