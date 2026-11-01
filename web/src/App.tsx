import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/data/auth';
import { useProfile } from '@/data/hooks';
import { applyAccent } from '@/lib/theme';
import { getSchemaVersion, setTimeZone } from '@/data/api';
import { EXPECTED_SCHEMA, REQUIRED_MIGRATIONS } from '@/lib/schema';
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

  const schema = useQuery({ queryKey: ['schema-version'], queryFn: getSchemaVersion, staleTime: Infinity });
  const behind = schema.isSuccess && (schema.data === null || schema.data < EXPECTED_SCHEMA);

  return (
    <div className="app">
      {behind ? (
        <div className="error" role="alert" style={{ maxWidth: 1240, margin: '0 auto' }}>
          <b>The database is behind this version of the app</b> (it reports {schema.data ?? 'no schema version'};
          expected {EXPECTED_SCHEMA}). Until it is migrated, approved food loses its macros and its sources' detail,
          and some settings will not save. From <code>app/</code>, run <code>supabase db push</code> — it applies
          anything missing up to <code>{REQUIRED_MIGRATIONS.at(-1)}</code>.
        </div>
      ) : null}
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
