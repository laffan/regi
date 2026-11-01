import type { Book, DayClosure, Entry, Goal, Profile, ProjectWithTotals, SavedMeal, UserModule } from '@/lib/types';
import type { Point } from '@/lib/projection';
import type { TotalsIndex } from '@/components/WeekStrip';

export interface WidgetProps {
  /** The module this cell is for — the tracker's own slug, for an activity. */
  slug: string;
  /** True in the 3-up grid the dashboard falls back to past three modules. */
  compact: boolean;
  today: string;
  totals: TotalsIndex;
  /** Today's entries, newest first. */
  entries: Entry[];
  goals: Goal[];
  settings: UserModule['settings'];
  /** This module's primary published series, last 30 days. */
  series: Point[];
  profile: Profile;
  books: Book[];
  savedMeals: SavedMeal[];
  writingProjects: ProjectWithTotals[];
  /** Today's closed module days ("Last meal of the day"). */
  closures: DayClosure[];
}
