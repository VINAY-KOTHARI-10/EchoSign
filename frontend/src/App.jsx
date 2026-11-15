// EchoSign - App entry point
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { RequireAuth, RequireAdmin, RequirePermission, GuestOnly } from './components/Guards';
import AppShell from './components/AppShell';
import AdminShell from './components/AdminShell';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ClassroomHub from './pages/ClassroomHub';
import Practice from './pages/Practice';
import Conversation from './pages/Conversation';
import History from './pages/History';
import Leaderboard from './pages/Leaderboard';
import Community from './pages/Community';
import Profile from './pages/Profile';
import AdminOverview from './pages/admin/Overview';
import AdminUsers from './pages/admin/Users';
import AdminSessions from './pages/admin/Sessions';
import AdminLanguages from './pages/admin/Languages';
import AdminClassrooms from './pages/admin/Classrooms';

const ClassroomRoom = lazy(() => import('./pages/ClassroomRoom'));

const Signs = lazy(() => import('./pages/Signs'));

const Progress = lazy(() => import('./pages/Progress'));
const Library = lazy(() => import('./pages/Library'));
const LectureNotes = lazy(() => import('./pages/LectureNotes'));
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'));
const Access = lazy(() => import('./pages/Access'));
const AdminAudit = lazy(() => import('./pages/admin/Audit'));

export default function App() {
  const { loading } = useAuth();
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
        </Route>
      </Route>

      <Route element={<RequireAdmin />}>
        <Route element={<AdminShell />}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/users" element={<AdminUsers />} />
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

