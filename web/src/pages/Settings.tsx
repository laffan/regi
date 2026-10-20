// 1i — Settings, with Sharing as the pane the designs work through.
//
// Sharing is per module and withdrawable: granting Weight does not grant
// Calories, and revoking takes the data back on the next read because the grant
// is what the row-level policies check.

import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/data/auth';
import {
  useConnections,
  useModules,
  useProfile,
  useRemoveConnection,
  useRequestConnection,
  useRespondToConnection,
  useSetModuleActive,
  useSetModuleShare,
} from '@/data/hooks';
import * as api from '@/data/api';
import { moduleDef } from '@/modules/registry';
import type { ModuleSlug } from '@/lib/types';

const PANES = [
  { to: '/settings/account', label: 'Account' },
  { to: '/settings/modules', label: 'Modules' },
  { to: '/settings/sharing', label: 'Sharing' },
  { to: '/settings/units', label: 'Units' },
  { to: '/settings/export', label: 'Data export' },
];

export function Settings() {
  return (
    <div className="settings">
      <div className="settings-nav">
        {PANES.map((pane) => (
          <NavLink key={pane.to} to={pane.to}>
            {pane.label}
          </NavLink>
        ))}
      </div>
      <div className="settings-body">
        <Routes>
          <Route index element={<Navigate to="/settings/sharing" replace />} />
          <Route path="account" element={<AccountPane />} />
          <Route path="modules" element={<ModulesPane />} />
          <Route path="sharing" element={<SharingPane />} />
          <Route path="units" element={<UnitsPane />} />
          <Route path="export" element={<ExportPane />} />
        </Routes>
      </div>
    </div>
  );
}

// ── sharing ─────────────────────────────────────────────────────────────────

function SharingPane() {
  const connections = useConnections();
  const modules = useModules();
  const request = useRequestConnection();
  const respond = useRespondToConnection();
  const share = useSetModuleShare();
  const remove = useRemoveConnection();

  const [email, setEmail] = useState('');
  const [found, setFound] = useState<{ id: string; email: string; display_name: string | null } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const active = (modules.data ?? []).filter((m) => m.active);
  const rows = connections.data ?? [];
  const activeCount = rows.filter((r) => r.status === 'active').length;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const search = async () => {
    setSearchError(null);
    setFound(null);
    if (!email.trim()) return;
    try {
      const person = await api.findPerson(email.trim());
      if (!person) setSearchError('No account uses that email.');
      setFound(person);
    } catch (err) {
      setSearchError((err as Error).message);
    }
  };

  return (
    <>
      <h3 style={{ margin: '0 0 4px' }}>Sharing</h3>
      <p style={{ fontSize: 13, maxWidth: 520, opacity: 0.75 }}>
        Connections see the modules you grant them, on their calendar alongside their own. Sharing is per
        module and can be withdrawn at any time.
      </p>

      <div className="field" style={{ maxWidth: 460, marginTop: 14 }}>
        <label htmlFor="conn">Add a connection by login email</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            id="conn"
            type="email"
            value={email}
            placeholder="dana@example.com"
            style={{ minHeight: 40 }}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
          />
          <button type="button" className="btn btn-primary" style={{ minHeight: 40 }} onClick={() => void search()}>
            Search
          </button>
        </div>
      </div>

      {searchError ? (
        <div className="error" style={{ maxWidth: 460, marginTop: 10 }}>
          {searchError}
        </div>
      ) : null}

      {found ? (
        <div
          style={{
            marginTop: 12,
            maxWidth: 460,
            border: '1px solid var(--line)',
            background: 'var(--warm)',
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ width: 36, height: 36, background: 'var(--color-neutral-400)', flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "800 13.5px 'Archivo'" }}>{found.display_name ?? found.email}</div>
            <div style={{ fontSize: 11.5, opacity: 0.6 }}>{found.email}</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={request.isPending}
            onClick={() =>
              request.mutate(found.email, {
                onSuccess: () => {
                  setFound(null);
                  setEmail('');
                },
              })
            }
          >
            Send request
          </button>
        </div>
      ) : null}

      <hr className="hr" />

      <div className="row-between">
        <h4 style={{ margin: 0 }}>Connections</h4>
        <span style={{ fontSize: 11.5, opacity: 0.55 }}>
          {activeCount} active · {pendingCount} pending
        </span>
      </div>

      <table className="table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Person</th>
            <th>Shares with you</th>
            <th>You share</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const incoming = row.status === 'pending' && !row.i_requested;
            return (
              <tr key={row.id}>
                <td>
                  <div style={{ fontWeight: 800 }}>{row.person?.display_name ?? 'Unknown'}</div>
                  <div style={{ fontSize: 11.5, opacity: 0.55 }}>{row.person?.email}</div>
                </td>

                <td>
                  {row.status === 'pending' ? (
                    <span style={{ opacity: 0.5 }}>{incoming ? 'Wants to connect' : 'Awaiting reply'}</span>
                  ) : row.they_share.length ? (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {row.they_share.map((slug) => (
                        <span className="tag tag-neutral" key={slug}>
                          <Icon name={moduleDef(slug).icon} />
                          {moduleDef(slug).name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ opacity: 0.5 }}>nothing yet</span>
                  )}
                </td>

                <td>
                  {row.status === 'pending' ? (
                    <span className="tag tag-outline">Pending</span>
                  ) : editing === row.id ? (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {active.map((m) => (
                        <label key={m.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                          <input
                            type="checkbox"
                            checked={row.i_share.includes(m.slug as ModuleSlug)}
                            onChange={(e) =>
                              share.mutate({ id: row.id, slug: m.slug as ModuleSlug, granted: e.target.checked })
                            }
                          />
                          {moduleDef(m.slug).name}
                        </label>
                      ))}
                    </div>
                  ) : row.i_share.length ? (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {row.i_share.map((slug) => (
                        <span className="tag tag-accent" key={slug}>
                          <Icon name={moduleDef(slug).icon} />
                          {moduleDef(slug).name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ opacity: 0.5 }}>nothing</span>
                  )}
                </td>

                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {incoming ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => respond.mutate({ id: row.id, accept: true })}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => respond.mutate({ id: row.id, accept: false })}
                      >
                        Decline
                      </button>
                    </>
                  ) : row.status === 'pending' ? (
                    <button type="button" className="btn btn-ghost" onClick={() => remove.mutate(row.id)}>
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setEditing((id) => (id === row.id ? null : row.id))}
                    >
                      {editing === row.id ? 'Done' : 'Edit'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 ? <div className="empty">No connections yet.</div> : null}
    </>
  );
}

// ── the other panes ─────────────────────────────────────────────────────────

function ModulesPane() {
  const modules = useModules();
  const setActive = useSetModuleActive();

  return (
    <>
      <h3 style={{ margin: '0 0 4px' }}>Modules</h3>
      <p style={{ fontSize: 13, maxWidth: 520, opacity: 0.75 }}>
        Activating a module adds its widgets to the dashboard and its line to every calendar day. Nothing is
        deleted when you turn one off.
      </p>

      <table className="table" style={{ marginTop: 8, maxWidth: 560 }}>
        <tbody>
          {(modules.data ?? []).map((m) => {
            const def = moduleDef(m.slug);
            return (
              <tr key={m.slug}>
                <td style={{ width: 40 }}>
                  <Icon name={def.icon} />
                </td>
                <td>
                  <div style={{ fontWeight: 800 }}>{def.name}</div>
                  <div style={{ fontSize: 11.5, opacity: 0.55 }}>
                    publishes {def.publishes.join(', ')}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className={m.active ? 'btn btn-secondary' : 'btn btn-primary'}
                    disabled={setActive.isPending}
                    onClick={() => setActive.mutate({ slug: m.slug, active: !m.active })}
                  >
                    {m.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function AccountPane() {
  const profile = useProfile();
  const { signOut } = useAuth();

  return (
    <>
      <h3 style={{ margin: '0 0 4px' }}>Account</h3>
      <div className="field" style={{ maxWidth: 360, marginTop: 12 }}>
        <label htmlFor="acc-email">Login email</label>
        <input className="input" id="acc-email" value={profile.data?.email ?? ''} readOnly />
      </div>
      <div className="field" style={{ maxWidth: 360, marginTop: 12 }}>
        <label htmlFor="acc-name">Display name</label>
        <input
          className="input"
          id="acc-name"
          defaultValue={profile.data?.display_name ?? ''}
          onBlur={(e) => void api.updateProfile({ display_name: e.target.value })}
        />
      </div>
      <button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  );
}

function UnitsPane() {
  const profile = useProfile();

  return (
    <>
      <h3 style={{ margin: '0 0 4px' }}>Units</h3>
      <p style={{ fontSize: 13, opacity: 0.75 }}>Applies to what you type and what every module shows.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
        <div>
          <div className="kickn" style={{ marginBottom: 6 }}>
            Weight
          </div>
          <div className="seg">
            {(['lb', 'kg'] as const).map((unit) => (
              <label className="seg-opt" key={unit}>
                <input
                  type="radio"
                  name="wunit"
                  checked={profile.data?.weight_unit === unit}
                  onChange={() => void api.updateProfile({ weight_unit: unit }).then(() => profile.refetch())}
                />
                {unit}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="kickn" style={{ marginBottom: 6 }}>
            Distance
          </div>
          <div className="seg">
            {(['mi', 'km'] as const).map((unit) => (
              <label className="seg-opt" key={unit}>
                <input
                  type="radio"
                  name="dunit"
                  checked={profile.data?.distance_unit === unit}
                  onChange={() => void api.updateProfile({ distance_unit: unit }).then(() => profile.refetch())}
                />
                {unit}
              </label>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function ExportPane() {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const entries = await api.getEntries('1970-01-01', '2999-12-31');
      const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `regi-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3 style={{ margin: '0 0 4px' }}>Data export</h3>
      <p style={{ fontSize: 13, maxWidth: 520, opacity: 0.75 }}>
        Every entry you have logged, with its module, timestamp and payload, as JSON.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={busy}>
        {busy ? 'Preparing…' : 'Download entries'}
      </button>
    </>
  );
}
