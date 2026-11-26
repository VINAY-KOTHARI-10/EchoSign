'use client';

import { ErrorState } from '@/components/ui';

export default function RecentError({ reset }) {
  return (
    <div className="card">
      <ErrorState message="Recent activity could not be loaded.">
        <button type="button" onClick={reset} className="btn btn-outline btn-sm">Try again</button>
      </ErrorState>
    </div>
  );
}
