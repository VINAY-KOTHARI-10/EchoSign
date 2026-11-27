// EchoSign - App entry point
import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import * as api from './api';
import { setLanguages } from './lib/languages';
import { RequireAuth, RequireAdmin, RequirePermission, GuestOnly } from './components/Guards';
import AppShell from './components/AppShell';
import AdminShell from './features/admin/components/AdminShell';
import Landing from './features/landing/pages/Landing';
import Auth from './features/auth/pages/Auth';
import ForgotPassword from './features/auth/pages/ForgotPassword';
import ResetPassword from './features/auth/pages/ResetPassword';
import ClassroomHub from './features/classroom/pages/ClassroomHub';

// Pages load when first visited, so the first screen only downloads what it needs.
const Practice = lazy(() => import('./features/practice/pages/Practice'));
const People = lazy(() => import('./features/people/pages/People'));
const Conversation = lazy(() => import('./features/practice/pages/Conversation'));
const History = lazy(() => import('./features/progress/pages/History'));
const Leaderboard = lazy(() => import('./features/progress/pages/Leaderboard'));
const Community = lazy(() => import('./features/community/pages/Community'));
const Profile = lazy(() => import('./features/account/pages/Profile'));
const AdminOverview = lazy(() => import('./features/admin/pages/Overview'));
const AdminSessions = lazy(() => import('./features/admin/pages/Sessions'));
const AdminLanguages = lazy(() => import('./features/admin/pages/Languages'));
const AdminClassrooms = lazy(() => import('./features/admin/pages/Classrooms'));
const ClassroomRoom = lazy(() => import('./features/classroom/pages/ClassroomRoom'));

const Signs = lazy(() => import('./features/signs/pages/Signs'));
const Meet = lazy(() => import('./features/meet/pages/Meet'));

const Progress = lazy(() => import('./features/progress/pages/Progress'));
const Library = lazy(() => import('./features/library/pages/Library'));
const LectureNotes = lazy(() => import('./features/library/pages/LectureNotes'));
const TeacherDashboard = lazy(() => import('./features/classroom/pages/TeacherDashboard'));
const Access = lazy(() => import('./features/account/pages/Access'));
const AdminAudit = lazy(() => import('./features/admin/pages/Audit'));

export default function App() {
  const { loading } = useAuth();
  // The language pickers follow the Languages admin page: ask the server which languages are in effect.
  useEffect(() => { api.languages.list().then((r) => setLanguages(r.data.languages)).catch(() => { /* built-in list stays */ }); }, []);
  if (loading) return <div className="splash"><div className="spinner" /></div>;

  return (
    <Suspense fallback={<div className="splash"><div className="spinner" /></div>}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/classroom" element={<ClassroomHub />} />
          <Route path="/classroom/:code" element={<ClassroomRoom />} />
          <Route path="/signs" element={<Signs />} />
          <Route path="/meet" element={<Meet />} />
          <Route path="/dashboard" element={<Practice />} />
          <Route path="/conversation" element={<Conversation />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/history" element={<History />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/community" element={<Community />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:code" element={<LectureNotes />} />
          <Route path="/access" element={<Access />} />
          <Route element={<RequirePermission permission="analytics.class" need="Teacher" />}>
            <Route path="/teacher" element={<TeacherDashboard />} />
          </Route>
          <Route element={<RequirePermission permission="people.view" need="Teacher" />}>
            <Route path="/directory" element={<People />} />
            <Route path="/people" element={<Navigate to="/directory" replace />} />
          </Route>
        </Route>
      </Route>

      <Route element={<RequireAdmin />}>
        <Route element={<AdminShell />}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/directory" element={<People />} />
          <Route path="/admin/users" element={<Navigate to="/admin/directory" replace />} />
          <Route path="/admin/sessions" element={<AdminSessions />} />
          <Route path="/admin/classrooms" element={<AdminClassrooms />} />
          <Route path="/admin/languages" element={<AdminLanguages />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

