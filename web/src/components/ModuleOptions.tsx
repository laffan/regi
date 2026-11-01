// The options a module already has, gathered in one place so Settings →
// Modules and the module's own page show the same controls. Nothing here is
// new configuration except the daily calorie goal's own field.

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { TrackerDialog } from './TrackerDialog';
import type { ActiveModule } from '@/data/api';
import { useDeleteActivity, useProfile, useSetModuleSettings, useUpdateProfile } from '@/data/hooks';
import { group } from '@/lib/format';
import type { LookupSource } from '@/lib/types';

const SOURCE_NAMES: Record<LookupSource, { name: string; note: string }> = {
  usda: { name: 'USDA FoodData Central', note: 'database' },
  off: { name: 'Open Food Facts', note: 'database · barcodes always resolve here' },
  openai: { name: 'OpenAI', note: 'estimate, labelled as one' },
};

const ALL_SOURCES: LookupSource[] = ['usda', 'off', 'openai'];

export function readSourceOrder(raw: unknown): LookupSource[] {
  const list = Array.isArray(raw) ? raw : ['usda', 'off', 'openai'];
  return list.filter((s): s is LookupSource => ALL_SOURCES.includes(s as LookupSource));
}

/**
 * The order foods are priced in, and which sources are asked at all. Each
 * source is only asked about what the ones above it could not find.
 */
export function SourceOrderEditor({ module }: { module: ActiveModule }) {
  const save = useSetModuleSettings();
  const order = readSourceOrder(module.settings.source_order);
  const off = ALL_SOURCES.filter((s) => !order.includes(s));

  const write = (next: LookupSource[]) =>
    save.mutate({ slug: 'calories', settings: { ...module.settings, source_order: next } });

  const move = (index: number, by: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    write(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
      {order.map((source, i) => (
        <div key={source} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ width: 16 }}>{i + 1}</b>
          <span style={{ flex: 1, minWidth: 0 }}>
            {SOURCE_NAMES[source].name} <span style={{ opacity: 0.55 }}>— {SOURCE_NAMES[source].note}</span>
          </span>
          <button type="button" className="btn btn-ghost" style={{ padding: '0 4px' }} disabled={i === 0 || save.isPending} onClick={() => move(i, -1)} aria-label={`Move ${SOURCE_NAMES[source].name} up`}>
            ↑
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: '0 4px' }} disabled={i === order.length - 1 || save.isPending} onClick={() => move(i, 1)} aria-label={`Move ${SOURCE_NAMES[source].name} down`}>
            ↓
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '0 4px', fontSize: 11 }}
            disabled={order.length === 1 || save.isPending}
            onClick={() => write(order.filter((s) => s !== source))}
          >
            off
          </button>
        </div>
      ))}
      {off.map((source) => (
        <div key={source} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.6 }}>
          <span style={{ width: 16 }}>–</span>
          <span style={{ flex: 1 }}>{SOURCE_NAMES[source].name}</span>
          <button type="button" className="btn btn-ghost" style={{ padding: '0 4px', fontSize: 11 }} disabled={save.isPending} onClick={() => write([...order, source])}>
            use
          </button>
        </div>
      ))}
    </div>
  );
}

function CalorieGoalField({ module }: { module: ActiveModule }) {
  const save = useSetModuleSettings();
  const current = Number(module.settings.daily_target ?? 2200);
  const [text, setText] = useState(String(current));
  useEffect(() => setText(String(current)), [current]);

  const commit = () => {
    const value = Math.round(Number(text));
    if (!Number.isFinite(value) || value < 800 || value > 10000) {
      setText(String(current));
      return;
    }
    if (value !== current) save.mutate({ slug: 'calories', settings: { ...module.settings, daily_target: value } });
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input
        className="input"
        style={{ width: 96 }}
        inputMode="numeric"
        aria-label="Daily calorie goal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      kcal a day
      {save.isPending ? <span style={{ opacity: 0.5 }}>saving…</span> : null}
      {save.isSuccess && !save.isPending ? <span style={{ opacity: 0.5 }}>saved · {group(current)}</span> : null}
    </span>
  );
}

function UnitChoice<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T | undefined;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((opt) => (
        <label className="seg-opt" key={opt}>
          <input type="radio" name={name} checked={value === opt} onChange={() => onChange(opt)} />
          {opt}
        </label>
      ))}
    </div>
  );
}

/** Everything a module offers, or null when it has nothing to set. */
export function ModuleOptions({ module }: { module: ActiveModule }) {
  const save = useSetModuleSettings();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const removeTracker = useDeleteActivity();
  const [editingTracker, setEditingTracker] = useState(false);

  switch (module.slug) {
    case 'calories':
      return (
        <div className="mod-opts">
          <div className="opt">
            <span className="opt-label">Daily calorie goal</span>
            <CalorieGoalField module={module} />
          </div>
          <div className="opt" style={{ alignItems: 'flex-start' }}>
            <span className="opt-label">Pricing sources, in order</span>
            <div style={{ flex: 1, minWidth: 260 }}>
              <SourceOrderEditor module={module} />
            </div>
          </div>
        </div>
      );
    case 'writing':
      return (
        <div className="mod-opts">
          <div className="opt">
            <span className="opt-label">Leads on the calendar</span>
            <UnitChoice
              name="opt-measure"
              value={(module.settings.measure as 'words' | 'min') ?? 'words'}
              options={['words', 'min'] as const}
              onChange={(measure) => save.mutate({ slug: 'writing', settings: { ...module.settings, measure } })}
            />
          </div>
        </div>
      );
    case 'weight':
      return (
        <div className="mod-opts">
          <div className="opt">
            <span className="opt-label">Unit</span>
            <UnitChoice
              name="opt-wunit"
              value={profile.data?.weight_unit}
              options={['lb', 'kg'] as const}
              onChange={(weight_unit) => updateProfile.mutate({ weight_unit })}
            />
          </div>
        </div>
      );
    case 'running':
      return (
        <div className="mod-opts">
          <div className="opt">
            <span className="opt-label">Distance</span>
            <UnitChoice
              name="opt-dunit"
              value={profile.data?.distance_unit}
              options={['mi', 'km'] as const}
              onChange={(distance_unit) => updateProfile.mutate({ distance_unit })}
            />
          </div>
        </div>
      );
    default:
      if (module.kind !== 'activity') return null;
      return (
        <div className="mod-opts">
          <div className="opt">
            <span className="opt-label">Tracker</span>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingTracker(true)}>
              Rename or change icon
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={removeTracker.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove “${module.name}” and every day recorded in it? Deactivating keeps the history instead.`,
                  )
                ) {
                  removeTracker.mutate(module.slug);
                }
              }}
            >
              <Icon name="trash" />
              Remove
            </button>
          </div>
          {editingTracker ? (
            <TrackerDialog
              existing={{ slug: module.slug, name: module.name, icon: module.icon, nodes: module.icon_nodes ?? [] }}
              onClose={() => setEditingTracker(false)}
            />
          ) : null}
        </div>
      );
  }
}
