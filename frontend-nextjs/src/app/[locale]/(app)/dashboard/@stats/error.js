'use client';

// An error in this slot is shown here only; the rest of the dashboard keeps working.
import { ErrorState } from '@/components/ui';

export default function StatsError({ reset }) {
  return (
    <div className="card">
      <ErrorState message="These numbers could not be loaded.">
        <button type="button" onClick={reset} className="btn btn-outline btn-sm">Try again</button>
      </ErrorState>
    </div>
  );
}
