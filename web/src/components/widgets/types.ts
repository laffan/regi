import type { Book, Entry, Goal, Profile, SavedMeal, UserModule } from '@/lib/types';
import type { Point } from '@/lib/projection';
import type { TotalsIndex } from '@/components/WeekStrip';

export interface WidgetProps {
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
}
