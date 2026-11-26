// The signed-in area. The server checks the session first (requireSession), then the EchoSign sidebar frame is shown.
// The pages inside are of two kinds: the cloned EchoSign React screens (classroom, Sign Lab, Sign Meet...), which run in the
// browser, and the Next.js-only screens (overview, lectures, notes), which are rendered on the server.
// `modal` is a parallel route slot: a pop-up the "lectures" page can show on top (see @modal).
import { MemberFrame } from '@/react-app/ClientApp';
import { requireSession } from '@/lib/session';

export const metadata = { robots: { index: false, follow: false } }; // private pages are kept out of search engines

export default async function ShellLayout({ children, modal, params }) {
  const { locale } = await params;
  await requireSession(locale);
  return (
    <>
      <MemberFrame>{children}</MemberFrame>
      {modal}
    </>
  );
}
