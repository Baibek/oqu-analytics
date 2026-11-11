import type { Dataset, Lang, Student, Topic, Unit } from './types';

// CSV импорт/экспорт. Файл браузерде өңделеді, ешқайда жіберілмейді.

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') >>> 0);
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export const toCsv = (rows: (string | number)[][]) =>
  '﻿' + rows.map((r) => r.map((v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n');

export const RESULT_COLS = ['subject', 'grade', 'class', 'student_id', 'school', 'district', 'locality', 'language', 'textbook', 'baseline', 'topic', 'score', 'hours'] as const;
export const CURRICULUM_COLS = ['subject', 'grade', 'topic', 'section', 'planned_hours', 'prerequisites'] as const;
const REQUIRED = ['student_id', 'school', 'textbook', 'topic', 'score'];

export interface ImportIssue {
  code: 'missing_cols' | 'bad_score' | 'no_rows' | 'unknown_topic' | 'bad_hours';
  detail: string;
  fatal: boolean;
}

const num = (s: string | undefined) => (s === undefined || s === '' ? NaN : Number(s.replace(',', '.')));
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

export function importData(resultsCsv: string, curriculumCsv?: string, label = 'CSV'): { ds: Dataset | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const rows = parseCsv(resultsCsv);
  const head = (rows[0] ?? []).map((h) => h.toLowerCase());
  const missing = REQUIRED.filter((c) => !head.includes(c));
  if (missing.length) return { ds: null, issues: [{ code: 'missing_cols', detail: missing.join(', '), fatal: true }] };
  const col = (name: string) => head.indexOf(name);
  const get = (r: string[], name: string) => (col(name) >= 0 ? r[col(name)] : undefined);

  // Оқу жоспары (міндетті емес)
  const plan = new Map<string, { section: string; planned: number; prereq: string[] }>();
  const order: string[] = [];
  if (curriculumCsv) {
    const c = parseCsv(curriculumCsv);
    const ch = (c[0] ?? []).map((h) => h.toLowerCase());
    if (!ch.includes('topic') || !ch.includes('planned_hours')) {
      issues.push({ code: 'missing_cols', detail: 'curriculum: topic, planned_hours', fatal: false });
    } else {
      for (const r of c.slice(1)) {
        const name = r[ch.indexOf('topic')];
        const planned = num(r[ch.indexOf('planned_hours')]);
        if (!name) continue;
        if (!(planned > 0)) issues.push({ code: 'bad_hours', detail: name, fatal: false });
        plan.set(name, {
          section: (ch.includes('section') ? r[ch.indexOf('section')] : '') || '—',
          planned: planned > 0 ? Math.round(planned) : 1,
          prereq: (ch.includes('prerequisites') ? (r[ch.indexOf('prerequisites')] ?? '') : '').split(';').map((x) => x.trim()).filter(Boolean),
        });
        order.push(name);
      }
    }
  }

  const topicIdx = new Map<string, number>();
  order.forEach((name, i) => topicIdx.set(name, i));
  const unitIdx = new Map<string, number>();
  const units: Unit[] = [];
  const unitHours: Map<number, number>[] = [];
  const studIdx = new Map<string, number>();
  const students: { id: string; unit: number; baseline: number; scores: Map<number, number> }[] = [];
  let badScores = 0;
  const unknown = new Set<string>();

  for (const r of rows.slice(1)) {
    const topic = get(r, 'topic') ?? '';
    const score = num(get(r, 'score'));
    if (!topic || Number.isNaN(score) || score < 0 || score > 100) {
      badScores++;
      continue;
    }
    if (!topicIdx.has(topic)) {
      if (plan.size) {
        unknown.add(topic);
        continue;
      }
      topicIdx.set(topic, topicIdx.size);
    }
    const ti = topicIdx.get(topic)!;
    const school = get(r, 'school') ?? '';
    const textbook = get(r, 'textbook') ?? '';
    const lang: Lang = /^(ru|рус|орыс)/i.test(get(r, 'language') ?? '') ? 'ru' : 'kk';
    const cls = get(r, 'class') ?? '';
    const ukey = `${school}|${cls}|${textbook}|${lang}`;
    if (!unitIdx.has(ukey)) {
      unitIdx.set(ukey, units.length);
      units.push({ id: ukey, school, name: cls, district: get(r, 'district') ?? '', urban: /^(urban|city|қала|город|1|true)/i.test(get(r, 'locality') ?? ''), lang, textbook, hours: [] });
      unitHours.push(new Map());
    }
    const ui = unitIdx.get(ukey)!;
    const h = num(get(r, 'hours'));
    if (h > 0) unitHours[ui].set(ti, h);
    const skey = `${ukey}|${get(r, 'student_id')}`;
    if (!studIdx.has(skey)) {
      studIdx.set(skey, students.length);
      students.push({ id: get(r, 'student_id') ?? '', unit: ui, baseline: num(get(r, 'baseline')), scores: new Map() });
    }
    students[studIdx.get(skey)!].scores.set(ti, score);
  }

  if (badScores) issues.push({ code: 'bad_score', detail: String(badScores), fatal: false });
  if (unknown.size) issues.push({ code: 'unknown_topic', detail: [...unknown].slice(0, 5).join('; '), fatal: false });
  if (!students.length) return { ds: null, issues: [...issues, { code: 'no_rows', detail: '', fatal: true }] };

  const names = [...topicIdx.keys()];
  const topics: Topic[] = names.map((name, i) => {
    const p = plan.get(name);
    const seen = unitHours.map((m) => m.get(i)).filter((x): x is number => x !== undefined);
    return {
      id: name,
      name: { kk: name, ru: name },
      section: { kk: p?.section ?? '—', ru: p?.section ?? '—' },
      // Жоспар берілмесе, жоспарлы сағат ретінде сыныптардағы медиананы аламыз
      planned: p?.planned ?? (seen.length ? Math.max(1, Math.round(median(seen))) : 1),
      prereq: (p?.prereq ?? []).filter((x) => topicIdx.has(x)),
    };
  });
  units.forEach((u, ui) => (u.hours = names.map((_, i) => unitHours[ui].get(i) ?? NaN)));
  const out: Student[] = students.map((s) => ({ id: s.id, unit: s.unit, baseline: s.baseline, scores: names.map((_, i) => s.scores.get(i) ?? NaN) }));
  const withBase = out.filter((s) => !Number.isNaN(s.baseline)).length;
  const first = rows[1] ?? [];
  const subj = get(first, 'subject') || label;
  const grade = Number(get(first, 'grade')) || 0;
  return { ds: { label, subject: { kk: subj, ru: subj }, grade, synthetic: false, hasBaseline: withBase >= out.length * 0.8, topics, units, students: out }, issues };
}

export interface ImportedCourse {
  key: string;
  ds: Dataset;
}

/**
 * Бір файлда бірнеше пән мен параллель болуы мүмкін: жолдарды (subject, grade) бойынша
 * бөліп, әр топты жеке курс ретінде импорттаймыз. Оқу жоспары да солай бөлінеді.
 */
export function importCatalog(resultsCsv: string, curriculumCsv?: string, label = 'CSV'): { courses: ImportedCourse[]; issues: ImportIssue[] } {
  const rows = parseCsv(resultsCsv);
  const head = (rows[0] ?? []).map((h) => h.toLowerCase());
  const si = head.indexOf('subject');
  const gi = head.indexOf('grade');
  if (si < 0 && gi < 0) {
    const r = importData(resultsCsv, curriculumCsv, label);
    return { courses: r.ds ? [{ key: 'csv', ds: r.ds }] : [], issues: r.issues };
  }
  const plan = curriculumCsv ? parseCsv(curriculumCsv) : null;
  const ph = (plan?.[0] ?? []).map((h) => h.toLowerCase());
  const keyOf = (r: string[], sIdx: number, gIdx: number) => `${sIdx >= 0 ? (r[sIdx] ?? '') : ''}|${gIdx >= 0 ? (r[gIdx] ?? '') : ''}`;
  const groups = new Map<string, string[][]>();
  for (const r of rows.slice(1)) {
    const k = keyOf(r, si, gi);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const courses: ImportedCourse[] = [];
  const issues: ImportIssue[] = [];
  for (const [k, rs] of groups) {
    const planRows = plan && (ph.includes('subject') || ph.includes('grade')) ? [plan[0], ...plan.slice(1).filter((r) => keyOf(r, ph.indexOf('subject'), ph.indexOf('grade')) === k)] : plan;
    const r = importData(toCsv([rows[0], ...rs]), planRows ? toCsv(planRows) : undefined, label);
    issues.push(...r.issues.map((i) => ({ ...i, detail: `${k.replace('|', ', ')}: ${i.detail}` })));
    if (r.ds) courses.push({ key: `csv:${k}`, ds: r.ds });
  }
  return { courses, issues };
}

/** Деректі импорт форматындағы CSV-ге айналдыру (үлгі ретінде де қолданылады) */
export function exportResults(ds: Dataset, lang: Lang, limitUnits?: number): string {
  const rows: (string | number)[][] = [[...RESULT_COLS]];
  for (const s of ds.students) {
    if (limitUnits !== undefined && s.unit >= limitUnits) continue;
    const u = ds.units[s.unit];
    ds.topics.forEach((t, i) => {
      if (Number.isNaN(s.scores[i])) return;
      rows.push([ds.subject[lang], ds.grade || '', u.name, s.id, u.school, u.district, u.urban ? 'urban' : 'rural', u.lang, u.textbook, Number.isNaN(s.baseline) ? '' : s.baseline, t.name[lang], s.scores[i], Number.isNaN(u.hours[i]) ? '' : u.hours[i]]);
    });
  }
  return toCsv(rows);
}

export function exportCurriculum(ds: Dataset, lang: Lang): string {
  const byId = new Map(ds.topics.map((t) => [t.id, t.name[lang]]));
  return toCsv([[...CURRICULUM_COLS], ...ds.topics.map((t) => [ds.subject[lang], ds.grade || '', t.name[lang], t.section[lang], t.planned, t.prereq.map((p) => byId.get(p) ?? p).join(';')])]);
}

export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
