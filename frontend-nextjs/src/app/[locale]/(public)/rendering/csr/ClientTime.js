'use client';

// A Client Component: it runs in the browser, so it can use state and effects. Data is fetched on the client (client-side fetching).
import { useEffect, useState } from 'react';
import TimeCard from '@/components/TimeCard';

export default function ClientTime({ title, body, label, loading }) {
  const [time, setTime] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/time', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setTime(data.time); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  return <TimeCard title={title} body={body} label={label} time={failed ? '—' : time ?? loading} note="'use client' + useEffect + fetch('/api/time')" />;
}
