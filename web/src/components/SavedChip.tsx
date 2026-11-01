import { useDeleteSavedMeal } from '@/data/hooks';
import { group } from '@/lib/format';
import type { SavedMeal } from '@/lib/types';

/**
 * A saved combination as a one-tap chip. Hovering the calorie figure turns it
 * into an ×; that deletes the combination, after asking.
 */
export function SavedChip({
  meal,
  onAdd,
  disabled,
}: {
  meal: SavedMeal;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const remove = useDeleteSavedMeal();

  return (
    <span className="chip-group" title={meal.detail ?? undefined}>
      <button type="button" className="btn btn-secondary chip chip-main" disabled={disabled} onClick={onAdd}>
        {meal.name}
      </button>
      <button
        type="button"
        className="btn btn-secondary chip chip-kcal"
        disabled={remove.isPending}
        aria-label={`Delete the saved combination “${meal.name}”`}
        onClick={() => {
          if (window.confirm(`Delete the saved combination “${meal.name}”? Entries already logged from it stay.`)) {
            remove.mutate(meal.id);
          }
        }}
      >
        <span className="kcal">{group(meal.kcal)}</span>
        <span className="x" aria-hidden="true">
          ×
        </span>
      </button>
    </span>
  );
}
