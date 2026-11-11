import { useState } from 'react';
import type { Status } from '../lib/analysis';
import { fmt, TFn, statusLabel } from './common';

// Кітапханасыз SVG графиктер. Түс — мәртебенің түсі (--*-fill), бірақ мәртебе әрқашан
// мәтінмен де жазылады (подсказка, кесте, легенда), сондықтан ақпарат тек түске сүйенбейді.

export interface BarDatum {
  label: string;
  value: number;
  lo?: number;
  hi?: number;
  n: number;
  status: Status;
  detail?: string;
}

/** Мәтінді ені шектеулі жолдарға бөлу (SVG-де автоматты тасымал жоқ) */
function wrap(text: string, max: number, lines = 2): string[] {
  const out: string[] = [];
  let cur = '';
  // Бағанның еніне сыймайтын жалғыз ұзын сөз «…» арқылы қысқартылады (толық атауы — подсказкада және кестеде)
  for (const raw of text.split(/\s+/)) {
    const w = raw.length > max ? raw.slice(0, max - 1) + '…' : raw;
    if ((cur + ' ' + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = kept[lines - 1].slice(0, max - 1) + '…';
    return kept;
  }
  return out;
}

/** Жоғарғы бұрыштары дөңгеленген, табаны түзу баған */
const barPath = (x: number, y: number, w: number, h: number, r = 4) => {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

export function BarChart({ data, t, title }: { data: BarDatum[]; t: TFn; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 260;
  const m = { l: 36, r: 12, t: 16, b: 46 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const step = iw / Math.max(1, data.length);
  const bw = Math.min(56, step * 0.56);
  const y = (v: number) => m.t + ih - (v / 100) * ih;
  const maxChars = Math.max(7, Math.floor(step / 6.4));

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${fmt(d.value)}% (${statusLabel(d.status, t)})`).join('; ')}`} onMouseLeave={() => setHover(null)}>
        <g className="grid">
          {[0, 25, 50, 75, 100].map((v) => (
            <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />
          ))}
        </g>
        <g className="axis">
          {[0, 25, 50, 75, 100].map((v) => (
            <text key={v} x={m.l - 8} y={y(v) + 4} textAnchor="end">
              {v}%
            </text>
          ))}
        </g>
        {data.map((d, i) => {
          const x = m.l + step * i + (step - bw) / 2;
          const top = y(Math.max(0, d.value));
          return (
            <g key={d.label}>
              <rect className="hit" x={m.l + step * i} y={m.t} width={step} height={ih} onMouseEnter={() => setHover(i)} />
              <path className={`bar fill-${d.status} ${hover === i ? 'hl' : ''}`} d={barPath(x, top, bw, y(0) - top)} />
              <text className="val" x={x + bw / 2} y={top - 6} textAnchor="middle">
                {fmt(d.value)}%
              </text>
              <text className="lbl" x={x + bw / 2} y={H - m.b + 16} textAnchor="middle">
                <title>{d.label}</title>
                {wrap(d.label, maxChars).map((ln, k) => (
                  <tspan key={k} x={x + bw / 2} dy={k ? 13 : 0}>
                    {ln}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        <line className="ref hard" x1={m.l} x2={W - m.r} y1={y(50)} y2={y(50)} />
        <line className="ref watch" x1={m.l} x2={W - m.r} y1={y(65)} y2={y(65)} />
        <text className="ref-t watch" x={W - m.r} y={y(65) - 5} textAnchor="end">
          65%
        </text>
        <text className="ref-t hard" x={W - m.r} y={y(50) - 5} textAnchor="end">
          50%
        </text>
      </svg>
      {hover !== null && data[hover] && (
        <div className="tip" style={{ left: `${((m.l + step * hover + step / 2) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%` }}>
          <b>{data[hover].label}</b>
          {t('Меңгеру үлесі', 'Доля усвоивших')}: {fmt(data[hover].value)}%
          {data[hover].lo !== undefined && !Number.isNaN(data[hover].lo!) && ` (${fmt(data[hover].lo)}–${fmt(data[hover].hi)})`}
          <br />
          {statusLabel(data[hover].status, t)} · {data[hover].n} {t('нәтиже', 'результатов')}
          {data[hover].detail && (
            <>
              <br />
              {data[hover].detail}
            </>
          )}
        </div>
      )}
      <details className="chart-table">
        <summary>{t('Кесте түрінде көру', 'Показать таблицей')}</summary>
        <table>
          <thead>
            <tr>
              <th>{t('Бөлім', 'Раздел')}</th>
              <th className="num">{t('Меңгеру', 'Усвоение')}</th>
              <th>{t('Мәртебе', 'Статус')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="num">{fmt(d.value)}%</td>
                <td>{statusLabel(d.status, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export interface DonutSlice {
  key: 'hard' | 'watch' | 'ok';
  value: number;
}

export function Donut({ slices, t, total, centerLabel }: { slices: DonutSlice[]; t: TFn; total: number; centerLabel: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const R = 90;
  const r = 64;
  const C = 100;
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;
  let a0 = -Math.PI / 2;
  const arc = (a1: number, a2: number) => {
    const large = a2 - a1 > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    return `M${p(R, a1)}A${R},${R} 0 ${large} 1 ${p(R, a2)}L${p(r, a2)}A${r},${r} 0 ${large} 0 ${p(r, a1)}Z`;
  };
  const hov = slices.find((s) => s.key === hover);
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 200 200" role="img" aria-label={slices.map((s) => `${statusLabel(s.key, t)}: ${s.value}`).join(', ')}>
          {slices.map((s) => {
            if (!s.value) return null;
            const a1 = a0;
            const a2 = a0 + (s.value / sum) * Math.PI * 2 - (s.value === sum ? 0.0001 : 0);
            a0 = a2;
            return <path key={s.key} className={`fill-${s.key}`} d={arc(a1, a2)} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} />;
          })}
        </svg>
        <div className="center">
          <div>
            <b>{hov ? hov.value : total}</b>
            <span>{hov ? statusLabel(hov.key, t) : centerLabel}</span>
          </div>
        </div>
      </div>
      <div className="donut-legend">
        {slices.map((s) => (
          <div key={s.key}>
            <b>{s.value}</b>
            <span>
              <i className={`sw ${s.key}`} />
              {statusLabel(s.key, t)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
