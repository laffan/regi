import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { group } from '@/lib/format';
import type { ProjectWithTotals, WritingMeasure } from '@/lib/types';

interface Props {
  projects: ProjectWithTotals[];
  /** Which project the sheet opens on — the one the widget was showing. */
  initialProjectId?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: { projectId: string | null; amount: number; measure: WritingMeasure; note?: string }) => void;
}

/**
 * A writing session: which project, how much, and in which unit. The unit
 * defaults to the project's own — a novel counts words, morning pages count
 * minutes — but either is always available, because some days you only know
 * you sat there for half an hour.
 */
export function LogSessionDialog({ projects, initialProjectId, busy, onClose, onSubmit }: Props) {
  const active = projects.filter((p) => p.status === 'active');
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? active[0]?.id ?? '');
  const project = projects.find((p) => p.id === projectId);
  const [measure, setMeasure] = useState<WritingMeasure>(project?.measure ?? 'words');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const pickProject = (id: string) => {
    setProjectId(id);
    const next = projects.find((p) => p.id === id);
    if (next) setMeasure(next.measure);
  };

  const submit = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    onSubmit({ projectId: projectId || null, amount: value, measure, note: note || undefined });
  };

  return (
    <Dialog
      title="Log session"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Log'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="ls-project">Project</label>
        <select
          id="ls-project"
          className="input"
          value={projectId}
          onChange={(e) => pickProject(e.target.value)}
        >
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
              {p.kind ? ` · ${p.kind}` : ''}
            </option>
          ))}
          <option value="">No project</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="ls-amount">{measure === 'words' ? 'Words written' : 'Minutes spent'}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="ls-amount"
            className="input"
            inputMode="numeric"
            placeholder={measure === 'words' ? '640' : '25'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          <div className="seg">
            {(
              [
                ['words', 'Words'],
                ['min', 'Minutes'],
              ] as const
            ).map(([value, label]) => (
              <label className="seg-opt" key={value}>
                <input
                  type="radio"
                  name="ls-measure"
                  checked={measure === value}
                  onChange={() => setMeasure(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {project ? (
        <div style={{ fontSize: 11.5, opacity: 0.6 }}>
          {project.target_kind === 'total' && project.target
            ? `${group(project.measure === 'words' ? project.words : project.minutes)} of ${group(project.target)} ${
                project.measure === 'words' ? 'words' : 'min'
              } so far`
            : project.target
              ? `Daily target ${group(project.target)} ${project.measure === 'words' ? 'words' : 'min'}`
              : `${project.sessions} session${project.sessions === 1 ? '' : 's'} so far`}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="ls-note">Note (optional)</label>
        <input
          id="ls-note"
          className="input"
          placeholder="finished the chapter"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
