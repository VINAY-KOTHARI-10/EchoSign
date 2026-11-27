'use client';

// The EchoSign React screen, cloned unchanged, behind the same permission guard as in the React app.
import { OutletProvider } from 'react-router-dom';
import { RequirePermission } from '@/react-app/components/Guards';
import People from '@/react-app/features/people/pages/People';

export default function Page() {
  return <OutletProvider element={<People />}><RequirePermission permission="people.view" need="Teacher" /></OutletProvider>;
}
