// The full Lucide set, for the tracker icon picker. Loaded on demand — it is
// only needed while someone is choosing an icon; once chosen, the icon's
// geometry is stored with the tracker and drawn without this file.

import { icons } from 'lucide';
import type { IconNode } from '@/lib/types';

export interface CatalogIcon {
  /** Kebab-case Lucide name, e.g. "dumbbell", "glass-water". */
  name: string;
  /** The same name split into words, for search. */
  words: string;
  nodes: IconNode;
}

function kebab(pascal: string): string {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])(\d)/g, '$1-$2')
    .toLowerCase();
}

export const CATALOG: CatalogIcon[] = Object.entries(icons).map(([pascal, nodes]) => {
  const name = kebab(pascal);
  return { name, words: name.replace(/-/g, ' '), nodes: nodes as unknown as IconNode };
});
