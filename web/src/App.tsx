import { useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/data/auth';
import { useProfile } from '@/data/hooks';
import { applyAccent } from '@/lib/theme';
import { setTimeZone } from '@/data/api';
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

  return <SignedIn />;
}

function SignedIn() {
  const profile = useProfile();
  const accent = profile.data?.accent_color;
  useEffect(() => {
    if (accent) applyAccent(accent);
  }, [accent]);

  // The calendar day is worked out on the server in the profile's zone, so it
  // has to be this device's zone — otherwise an evening meal in California
  // lands on tomorrow and "today" never sees it.
  const qc = useQueryClient();
  const synced = useRef(false);
  const zone = profile.data?.time_zone;
  useEffect(() => {
    if (!zone || synced.current) return;
    synced.current = true;
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device || device === zone) return;
    setTimeZone(device)
      .then((changed) => {
        if (changed) void qc.invalidateQueries();
      })
      .catch(() => {
        // An unknown zone name, or an older backend: keep the stored one.
      });
  }, [zone, qc]);

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
