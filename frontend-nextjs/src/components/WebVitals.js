'use client';

// Performance monitoring (INT257: Performance Monitoring). Reports the Core Web Vitals (LCP, CLS, INP...) of real visits
// to /api/vitals, where they are logged. Vercel Speed Insights (in the layout) collects the same numbers in a dashboard.
import { useReportWebVitals } from 'next/web-vitals';

export default function WebVitals() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({ name: metric.name, value: Math.round(metric.value * 100) / 100, rating: metric.rating, id: metric.id, path: window.location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/vitals', body);
    else fetch('/api/vitals', { method: 'POST', body, keepalive: true }).catch(() => {});
  });
  return null;
}
