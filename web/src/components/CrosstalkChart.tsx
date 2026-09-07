// The chart that owns neither of its series.
//
// Bars are one module's published daily series, the line is another's, and the
// dashed run to the hollow marker is the fitted projection to a milestone. It
// subscribes; it does not write.

import { projectToTarget, type Point } from '@/lib/projection';
import { shortDate } from '@/lib/dates';

const INK = '#2a2320';
const ACCENT = '#c8452a';
const ACCENT_DEEP = '#a1301a';
const BAR = '#e0d7cb';
const BASELINE = '#d8cec3';

interface Props {
  /**
   * The date axis. Passing it explicitly keeps two series with different
   * logging rhythms — daily calories, three runs a week — on the same days
   * instead of stretching the sparser one across the plot.
   */
  domain?: string[];
  bars: Point[];
  barLabel: string;
  barTarget?: number | null;
  barTargetLabel?: string;
  line: Point[];
  lineLabel: string;
  lineDashed?: boolean;
  goal?: { target: number; label: string } | null;
  height?: number;
  footnote?: string;
  ariaLabel: string;
}

export function CrosstalkChart({
  domain,
  bars,
  barLabel,
  barTarget,
  barTargetLabel,
  line,
  lineLabel,
  lineDashed = false,
  goal,
  height = 150,
  footnote,
  ariaLabel,
}: Props) {
  const W = 620;
  const H = height;
  const baseY = H - 12;
  const topY = 16;

  if (!bars.length && !line.length) {
    return <div className="empty">Nothing published yet — log a day to draw this.</div>;
  }

  const dates = domain ?? [...new Set([...bars, ...line].map((p) => p.date))].sort();
  const slot = W / Math.max(dates.length, 1);
  const xOf = (date: string) => dates.indexOf(date) * slot + slot / 2;
  const inDomain = (p: Point) => dates.includes(p.date);

  const barPoints = bars.filter(inDomain);
  const linePointsIn = line.filter(inDomain);

  const barMax = Math.max(...barPoints.map((b) => b.value), barTarget ?? 0, 1);
  const barY = (v: number) => baseY - (v / barMax) * (baseY - topY - 24);

  // The line gets its own scale with headroom, so a flat weight trend still
  // reads as a trend rather than a straight edge.
  const lineValues = linePointsIn.map((p) => p.value);
  const goalValue = goal?.target;
  const lineMin = Math.min(...lineValues, goalValue ?? Infinity);
  const lineMax = Math.max(...lineValues, goalValue ?? -Infinity);
  const span = Math.max(lineMax - lineMin, 0.5);
  const lineY = (v: number) => topY + ((lineMax - v) / span) * (baseY - topY - 60);

  const linePath = linePointsIn.map((p) => `${xOf(p.date).toFixed(1)},${lineY(p.value).toFixed(1)}`).join(' ');
  const last = linePointsIn.at(-1);
  const projection = goal && linePointsIn.length >= 3 ? projectToTarget(linePointsIn, goal.target) : null;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} role="img" aria-label={ariaLabel}>
        {barTarget ? (
          <>
            <line x1="0" y1={barY(barTarget)} x2={W} y2={barY(barTarget)} stroke={ACCENT} strokeWidth="1" strokeDasharray="5 4" />
            <text x="4" y={barY(barTarget) - 4} fontFamily="Archivo" fontSize="10" fill={ACCENT_DEEP}>
              {barTargetLabel}
            </text>
          </>
        ) : null}

        <g fill={BAR}>
          {barPoints.map((b) => {
            const y = barY(b.value);
            return (
              <rect
                key={b.date}
                x={xOf(b.date) - slot * 0.35}
                y={y}
                width={slot * 0.7}
                height={Math.max(baseY - y, 0)}
              >
                <title>{`${shortDate(b.date)} · ${Math.round(b.value)}`}</title>
              </rect>
            );
          })}
        </g>

        {linePointsIn.length > 1 ? (
          <polyline
            points={linePath}
            fill="none"
            stroke={lineDashed ? INK : ACCENT}
            strokeWidth="2.5"
            strokeDasharray={lineDashed ? '6 4' : undefined}
          />
        ) : null}

        {projection && last ? (
          <>
            <polyline
              points={`${xOf(last.date).toFixed(1)},${lineY(last.value).toFixed(1)} ${W - 6},${lineY(goal!.target).toFixed(1)}`}
              fill="none"
              stroke={ACCENT}
              strokeWidth="2"
              strokeDasharray="5 5"
              opacity="0.65"
            />
            <circle cx={W - 6} cy={lineY(goal!.target)} r="4.5" fill="#fbf8f4" stroke={ACCENT} strokeWidth="2" />
            <text
              x={W - 12}
              y={lineY(goal!.target) - 10}
              textAnchor="end"
              fontFamily="Archivo"
              fontSize="10.5"
              fontWeight="700"
              fill={ACCENT_DEEP}
            >
              {`${goal!.label} · est. ${shortDate(projection.date)}`}
            </text>
          </>
        ) : null}

        <line x1="0" y1={baseY} x2={W} y2={baseY} stroke={BASELINE} strokeWidth="2" />
        {dates.length ? (
          <>
            <text x="4" y={H - 1} fontFamily="Archivo" fontSize="10.5" fill={INK} opacity="0.55">
              {shortDate(dates[0])}
            </text>
            <text x={W - 4} y={H - 1} textAnchor="end" fontFamily="Archivo" fontSize="10.5" fill={INK} opacity="0.55">
              {shortDate(dates[dates.length - 1])}
            </text>
          </>
        ) : null}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 11.5, opacity: 0.7 }}>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 2.5,
              background: lineDashed ? INK : ACCENT,
              verticalAlign: 'middle',
              marginRight: 5,
            }}
          />
          {lineLabel}
        </span>
        <span>
          <span
            style={{ display: 'inline-block', width: 10, height: 10, background: BAR, verticalAlign: 'middle', marginRight: 5 }}
          />
          {barLabel}
        </span>
        {projection ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2px dashed ${ACCENT}` }} />
            projected to goal
          </span>
        ) : null}
        {footnote ? <span style={{ marginLeft: 'auto' }}>{footnote}</span> : null}
      </div>
    </>
  );
}
