'use client';

// The EchoSign React screen, cloned unchanged, behind the same permission guard as in the React app.
import { OutletProvider } from 'react-router-dom';
import { RequirePermission } from '@/react-app/components/Guards';
import TeacherDashboard from '@/react-app/features/classroom/pages/TeacherDashboard';

export default function Page() {
  return <OutletProvider element={<TeacherDashboard />}><RequirePermission permission="analytics.class" need="Teacher" /></OutletProvider>;
}
