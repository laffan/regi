// "Track Activity": a module of one's own. A name, an icon, and from then on a
// daily "I did!" / "Not today".

import { useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { IconPicker } from './IconPicker';
import { useCreateActivity, useUpdateActivity } from '@/data/hooks';
import type { IconNode } from '@/lib/types';

export function TrackerDialog({
  existing,
  onClose,
}: {
  existing?: { slug: string; name: string; icon: string; nodes: IconNode };
  onClose: () => void;
}) {
  const create = useCreateActivity();
  const update = useUpdateActivity();
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState<{ name: string; nodes: IconNode } | null>(
    existing?.nodes?.length ? { name: existing.icon, nodes: existing.nodes } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  const submit = () => {
    const clean = name.trim();
    if (!clean) return setError('Give it a name.');
    if (clean.length > 40) return setError('Forty characters at most.');
    if (!icon) return setError('Pick an icon.');
    const input = { name: clean, icon: icon.name, nodes: icon.nodes };
    const done = { onSuccess: onClose, onError: (err: Error) => setError(err.message) };
    if (existing) update.mutate({ slug: existing.slug, input }, done);
    else create.mutate(input, done);
  };

  return (
    <Dialog
      title={existing ? 'Edit tracker' : 'Track an activity'}
      onClose={onClose}
      wide
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : existing ? 'Save' : 'Start tracking'}
          </button>
        </>
      }
    >
      {!existing ? (
        <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
          A simple module of your own: each day it asks one thing — did you? — with an “I did!” / “Not today” switch.
        </p>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label htmlFor="tr-name">Name</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span
            style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'var(--color-accent)', color: 'var(--color-on-accent)', flex: 'none' }}
            aria-hidden="true"
          >
            {icon ? <Icon name={icon} size={20} /> : <Icon name="activity" size={20} />}
          </span>
          <input
            id="tr-name"
            className="input"
            placeholder="Stretch, Meditate, No phone after 10…"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </div>
      </div>

      <div className="field">
        <label>Icon</label>
        <IconPicker value={icon?.name ?? null} onChange={setIcon} />
      </div>
    </Dialog>
  );
}
