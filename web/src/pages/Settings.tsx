// 1i — Settings, with Sharing as the pane the designs work through.
//
// Sharing is per module, in both directions, and withdrawable. For each
// module you choose what a connection gets — nothing, only whether you logged
// that day, or the full detail — and for each module they share you choose
// whether to see it. Revoking takes the data back on the next read, because
// the grant is what the row-level policies check.

import { Fragment, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { ModuleOptions } from '@/components/ModuleOptions';
import { TrackerDialog } from '@/components/TrackerDialog';
import { useAuth } from '@/data/auth';
import {
  useConnections,
  useModules,
  useProfile,
  useRemoveConnection,
  useRequestConnection,
  useRespondToConnection,
  useSetModuleActive,
  useSetReceive,
  useSetShareLevel,
  useUpdateProfile,
} from '@/data/hooks';
import * as api from '@/data/api';
import { applyAccent, contrast, DEFAULT_ACCENT, isHex, onAccent, SWATCHES } from '@/lib/theme';
import { moduleDef } from '@/modules/registry';
import type { ShareLevel } from '@/lib/types';

const PANES = [
  { to: '/settings/account', label: 'Account' },
  { to: '/settings/appearance', label: 'Appearance' },
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
          <Route path="appearance" element={<AppearancePane />} />
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
  const setLevel = useSetShareLevel();
  const setReceive = useSetReceive();
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
        Connections see the modules you grant them, on their calendar alongside their own. For each module you
        choose what they get: nothing, only whether you logged that day, or the full detail. You also choose
        which of their modules you see. Everything can be changed or withdrawn at any time.
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
            const theyDetail = row.they_share_detail ?? Object.fromEntries(row.they_share.map((s) => [s, 'full']));
            const myDetail = row.i_share_detail ?? Object.fromEntries(row.i_share.map((s) => [s, 'full']));
            const muted = new Set(row.i_mute ?? []);
            const isOpen = editing === row.id;

            return (
              <Fragment key={row.id}>
                <tr>
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
                          <span
                            className="tag tag-neutral"
                            key={slug}
                            style={muted.has(slug) ? { opacity: 0.45, textDecoration: 'line-through' } : undefined}
                            title={muted.has(slug) ? 'Hidden by you' : theyDetail[slug] === 'presence' ? 'Logged / not logged only' : 'Full detail'}
                          >
                            <Icon name={moduleDef(slug).icon} />
                            {moduleDef(slug).name}
                            {theyDetail[slug] === 'presence' ? ' · ✓ only' : ''}
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
                    ) : row.i_share.length ? (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {row.i_share.map((slug) => (
                          <span className="tag tag-accent" key={slug}>
                            <Icon name={moduleDef(slug).icon} />
                            {moduleDef(slug).name}
                            {myDetail[slug] === 'presence' ? ' · ✓ only' : ''}
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
                        <button type="button" className="btn btn-ghost" onClick={() => respond.mutate({ id: row.id, accept: true })}>
                          Accept
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => respond.mutate({ id: row.id, accept: false })}>
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
                        aria-expanded={isOpen}
                        onClick={() => setEditing((id) => (id === row.id ? null : row.id))}
                      >
                        {isOpen ? 'Done' : 'Edit'}
                      </button>
                    )}
                  </td>
                </tr>

                {isOpen ? (
                  <tr>
                    <td colSpan={4} style={{ background: 'var(--warm)', padding: '10px 12px 14px' }}>
                      <table className="share-grid">
                        <thead>
                          <tr>
                            <th>Module</th>
                            <th>You send</th>
                            <th>You receive</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...new Set([...active.map((m) => m.slug), ...row.they_share])].map((slug) => {
                            const def = moduleDef(slug);
                            const mine = active.some((m) => m.slug === slug);
                            const level: ShareLevel = (myDetail[slug] as ShareLevel | undefined) ?? 'none';
                            const theirs = theyDetail[slug];
                            return (
                              <tr key={slug}>
                                <td>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                                    <Icon name={def.icon} />
                                    {def.name}
                                  </span>
                                </td>
                                <td>
                                  {mine ? (
                                    <div className="seg" role="radiogroup" aria-label={`What ${row.person?.display_name ?? 'they'} get of ${def.name}`}>
                                      {(
                                        [
                                          ['none', 'Nothing'],
                                          ['presence', 'Logged or not'],
                                          ['full', 'Full detail'],
                                        ] as const
                                      ).map(([value, text]) => (
                                        <label className="seg-opt" key={value}>
                                          <input
                                            type="radio"
                                            name={`send-${row.id}-${slug}`}
                                            checked={level === value}
                                            disabled={setLevel.isPending}
                                            onChange={() => setLevel.mutate({ id: row.id, slug, level: value })}
                                          />
                                          {text}
                                        </label>
                                      ))}
                                    </div>
                                  ) : (
                                    <span style={{ opacity: 0.45 }}>not one of your modules</span>
                                  )}
                                </td>
                                <td>
                                  {theirs ? (
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                      <input
                                        type="checkbox"
                                        checked={!muted.has(slug)}
                                        disabled={setReceive.isPending}
                                        onChange={(e) => setReceive.mutate({ id: row.id, slug, show: e.target.checked })}
                                      />
                                      Show on my calendar
                                      <span style={{ opacity: 0.5 }}>
                                        ({theirs === 'presence' ? 'they send logged or not' : 'they send full detail'})
                                      </span>
                                    </label>
                                  ) : (
                                    <span style={{ opacity: 0.45 }}>not shared with you</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 8 }}>
                        “Logged or not” shares a tick on the days you used the module — never the numbers, labels or
                        notes. Hiding a module only changes what you see; it does not change what they share.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
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
  const [creating, setCreating] = useState(false);

  const all = modules.data ?? [];
  // Your own trackers first, newest last, then the built-ins.
  const ordered = [...all.filter((m) => m.kind === 'activity'), ...all.filter((m) => m.kind !== 'activity')];

  return (
    <>
      <h3 style={{ margin: '0 0 4px' }}>Modules</h3>
      <p style={{ fontSize: 13, maxWidth: 560, opacity: 0.75 }}>
        Activating a module adds its widget to the dashboard and its line to every calendar day. Active modules
        show their options here. Nothing is deleted when you turn one off.
      </p>

      <button type="button" className="btn btn-primary" style={{ marginTop: 4 }} onClick={() => setCreating(true)}>
        <Icon name="plus" />
        Track Activity
      </button>
      <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 6, maxWidth: 520 }}>
        Make a module of your own — a name, an icon, and a daily “I did!” / “Not today”.
      </div>

      <div style={{ marginTop: 14, maxWidth: 680 }}>
        {ordered.map((m) => {
          const def = moduleDef(m.slug);
          return (
            <div className="mod-row" key={m.slug}>
              <div className="mod-row-head">
                <Icon name={def.icon} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>
                    {def.name}
                    {def.kind === 'activity' ? (
                      <span className="tag tag-neutral" style={{ marginLeft: 8 }}>
                        your tracker
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11.5, opacity: 0.55 }}>
                    {def.kind === 'activity' ? 'one yes/no a day' : `publishes ${def.publishes.join(', ')}`}
                  </div>
                </div>
                <button
                  type="button"
                  className={m.active ? 'btn btn-secondary' : 'btn btn-primary'}
                  disabled={setActive.isPending}
                  onClick={() => setActive.mutate({ slug: m.slug, active: !m.active })}
                >
                  {m.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              {m.active ? <ModuleOptions module={m} /> : null}
            </div>
          );
        })}
      </div>

      {creating ? <TrackerDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function AppearancePane() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const current = isHex(profile.data?.accent_color) ? profile.data!.accent_color!.toUpperCase() : DEFAULT_ACCENT;
  const [custom, setCustom] = useState(current);

  const choose = (hex: string) => {
    applyAccent(hex);
    setCustom(hex.toUpperCase());
    update.mutate({ accent_color: hex.toUpperCase() });
  };

  const paperContrast = contrast(current, '#fbf8f4');

  return (
    <>
      <h3 style={{ margin: '0 0 4px' }}>Appearance</h3>
      <p style={{ fontSize: 13, maxWidth: 520, opacity: 0.75 }}>
        The highlight colour marks today, fills each day as you use your modules, and colours buttons and
        selections. It follows your account to every device.
      </p>

      <div className="kickn" style={{ margin: '14px 0 8px' }}>
        Highlight
      </div>
      <div className="swatches">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            className="swatch"
            aria-pressed={current === swatch.hex.toUpperCase()}
            onClick={() => choose(swatch.hex)}
          >
            <i style={{ background: swatch.hex }} />
            {swatch.name}
            {swatch.hex === DEFAULT_ACCENT ? <span style={{ opacity: 0.5, fontSize: 11 }}>default</span> : null}
          </button>
        ))}
      </div>

      <div className="field" style={{ marginTop: 16, maxWidth: 320 }}>
        <label htmlFor="accent-custom">Or any colour</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="color"
            id="accent-custom"
            value={custom}
            onChange={(e) => setCustom(e.target.value.toUpperCase())}
            style={{ width: 44, height: 36, padding: 0, border: '1px solid var(--color-divider)', background: 'none' }}
          />
          <code style={{ fontSize: 13 }}>{custom}</code>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={custom === current || update.isPending}
            onClick={() => choose(custom)}
          >
            Use
          </button>
        </div>
      </div>

      <div className="kickn" style={{ margin: '18px 0 8px' }}>
        Preview
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="btn btn-primary">Log food</span>
        <span className="tag tag-accent">Active</span>
        <span className="kick">Calories</span>
        <span style={{ display: 'inline-flex', gap: 2 }}>
          {[0, 33, 66, 100].map((pct) => (
            <span
              key={pct}
              style={{
                width: 34,
                height: 34,
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 800,
                background: `color-mix(in srgb, var(--color-accent) ${pct}%, var(--color-bg))`,
                color: pct >= 60 ? onAccent(current) : 'var(--ink)',
              }}
            >
              {pct}%
            </span>
          ))}
        </span>
      </div>
      {paperContrast < 1.6 ? (
        <div className="error" style={{ marginTop: 12, maxWidth: 520 }}>
          This colour is very close to the page background — filled days and buttons will be hard to see.
        </div>
      ) : null}
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
