import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { CatalogIcon } from './iconCatalog';
import type { IconNode } from '@/lib/types';

// A few to start from before anything is typed.
const SUGGESTED = [
  'dumbbell', 'bike', 'footprints', 'glass-water', 'pill', 'brain', 'heart', 'leaf', 'sun', 'moon',
  'music', 'guitar', 'piano', 'palette', 'camera', 'languages', 'graduation-cap', 'book-marked',
  'code', 'sprout', 'flower', 'dog', 'cigarette-off', 'wine-off', 'coffee', 'apple', 'carrot',
  'bed', 'bath', 'droplet', 'flame', 'mountain', 'waves', 'tent', 'phone-off', 'smile', 'hand-heart',
  'piggy-bank', 'broom', 'shirt', 'stretch-horizontal', 'timer', 'alarm-clock', 'check-check',
];

export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: { name: string; nodes: IconNode }) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogIcon[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    import('./iconCatalog')
      .then((m) => live && setCatalog(m.CATALOG))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    if (!q) {
      const byName = new Map(catalog.map((i) => [i.name, i]));
      const picks = SUGGESTED.map((n) => byName.get(n)).filter((i): i is CatalogIcon => !!i);
      return picks.length ? picks : catalog.slice(0, 60);
    }
    const terms = q.split(/\s+/);
    return catalog.filter((i) => terms.every((t) => i.words.includes(t))).slice(0, 240);
  }, [catalog, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        className="input"
        placeholder={catalog ? `Search ${catalog.length.toLocaleString('en-US')} icons — “run”, “water”, “book”…` : 'Loading icons…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search icons"
      />
      {failed ? <div className="error">The icon set did not load. Try again.</div> : null}
      <div className="icon-grid" role="listbox" aria-label="Icons">
        {shown.map((icon) => (
          <button
            key={icon.name}
            type="button"
            title={icon.words}
            aria-label={icon.words}
            aria-pressed={value === icon.name}
            onClick={() => onChange({ name: icon.name, nodes: icon.nodes })}
          >
            <Icon name={{ name: icon.name, nodes: icon.nodes }} />
          </button>
        ))}
      </div>
      {catalog && query && shown.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.6 }}>No icon by that name — try a simpler word.</div>
      ) : null}
      <div style={{ fontSize: 10.5, opacity: 0.5 }}>Icons from Lucide (ISC licence).</div>
    </div>
  );
}
