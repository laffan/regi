import { useState } from 'react';
import { Dialog } from './Dialog';

interface Field {
  name: string;
  label: string;
  placeholder?: string;
  initial?: string;
  width?: number;
}

interface Props {
  title: string;
  fields: Field[];
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
}

/** The small "how many?" sheet behind Log pages / Log run / Log session. */
export function ValueDialog({ title, fields, submitLabel, busy, error, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ''])),
  );

  const submit = () => {
    if (busy) return;
    onSubmit(values);
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {fields.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={`vd-${field.name}`}>{field.label}</label>
          <input
            id={`vd-${field.name}`}
            className="input"
            value={values[field.name]}
            placeholder={field.placeholder}
            style={field.width ? { width: field.width } : undefined}
            onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </div>
      ))}
    </Dialog>
  );
}
