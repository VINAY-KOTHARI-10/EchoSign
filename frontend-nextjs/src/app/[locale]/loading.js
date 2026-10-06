// Loading UI: shown at once while a page below this segment is being rendered on the server (streamed with Suspense).
import { LoadingState } from '@/components/ui';

export default function Loading() {
  return <div className="container section"><LoadingState label="Loading…" /></div>;
}
