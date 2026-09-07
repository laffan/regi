import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/data/auth';
import { Nav } from '@/components/Nav';
import { Dashboard } from '@/pages/Dashboard';
import { LogPage } from '@/pages/Log';
import { CalendarPage } from '@/pages/Calendar';
import { ModuleDetail } from '@/pages/ModuleDetail';
import { Settings } from '@/pages/Settings';
import { SignIn } from '@/pages/SignIn';

export function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="app">
        <div className="sheet">
          <div className="spinner">Loading…</div>
        </div>
      </div>
    );
  }

  if (!session) return <SignIn />;

  return (
    <div className="app">
      <Routes>
        <Route
          path="/"
          element={
            <Frame>
              <Dashboard />
            </Frame>
          }
        />
        <Route
          path="/log"
          element={
            <Frame>
              <LogPage />
            </Frame>
          }
        />
        <Route
          path="/calendar"
          element={
            <Frame>
              <CalendarPage />
            </Frame>
          }
        />
        <Route
          path="/module/:slug"
          element={
            <Frame>
              <ModuleDetail />
            </Frame>
          }
        />
        <Route
          path="/settings/*"
          element={
            <Frame narrow>
              <Settings />
            </Frame>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function Frame({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={narrow ? 'sheet sheet-narrow' : 'sheet'}>
      <Nav />
      {children}
    </div>
  );
}
