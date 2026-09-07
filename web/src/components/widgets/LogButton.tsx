/**
 * Every module widget ends in this control — same fill, same width, same flush-
 * left label. It is the one place a module is logged from the dashboard, so it
 * is never conditional and never restyled per module.
 */
export function LogButton({
  label,
  onClick,
  busy,
  compact,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className="btn btn-primary btn-block push"
      onClick={onClick}
      disabled={busy}
      style={compact ? undefined : { minHeight: 40 }}
    >
      {busy ? 'Saving…' : label}
    </button>
  );
}
