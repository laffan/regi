import { useState, type ReactNode } from 'react';

/**
 * The one way a module is logged from the dashboard: a standard input line
 * with its "Log …" button attached, first thing under the module's header.
 * Same shape for every module, so the dashboard reads as a column of inputs
 * with each module's numbers beneath.
 */
export function QuickInput({
  label,
  placeholder,
  ariaLabel,
  inputMode = 'decimal',
  busy,
  error,
  onSubmit,
  children,
}: {
  /** The button: "Log weight", "Log food". */
  label: string;
  placeholder: string;
  ariaLabel: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
  busy?: boolean;
  /** A save that failed after it was sent. */
  error?: string | null;
  /** Return a message to keep the text and show it; return nothing to clear the line. */
  onSubmit: (text: string) => string | void;
  /** Anything that belongs to the input itself, under it — a checkbox, a target. */
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    const result = onSubmit(value);
    if (typeof result === 'string') {
      setProblem(result);
      return;
    }
    setProblem(null);
    setText('');
  };

  return (
    <div className="qinput-wrap">
      <form
        className="qinput"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="input"
          inputMode={inputMode}
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
          {busy ? 'Saving…' : label}
        </button>
      </form>
      {children}
      {problem || error ? <div className="error">{problem ?? error}</div> : null}
    </div>
  );
}
