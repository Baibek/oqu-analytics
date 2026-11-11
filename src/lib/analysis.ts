import type { Dataset, Filter, Scope } from './types';
import { mean, ols, pearson, quantile, rng, sd, sum } from './stats';

// ---- Ортақ баптаулар (барлығы интерфейсте түсіндіріледі) ----
/** Балл осыдан жоғары болса, оқушы тақырыпты меңгерген деп саналады */
export const PASS = 50;
/** Меңгеру үлесі осыдан төмен — қиын тақырып */
export const HARD = 50;
/** Меңгеру үлесі осыдан төмен — назардағы тақырып */
export const WATCH = 65;
/** Қорытынды жасауға қажет ең аз көлем */
export const MIN_STUDENTS = 30;
export const MIN_UNITS = 5;
/** Бір мектеп немесе сынып таңдалғанда тақырыпқа қажет ең аз оқушы саны */
export const MIN_LOCAL = 10;

/** Мектептің реттік нөмірі: сенім аралығы мен қателер мектеп бойынша кластерленеді */
export function schoolIndex(ds: Dataset): number[] {
  const ids = new Map<string, number>();
  return ds.units.map((u) => {
    if (!ids.has(u.school)) ids.set(u.school, ids.size);
    return ids.get(u.school)!;
  });
}

export function applyScope(ds: Dataset, sc: Scope): Dataset {
  if (sc.unit !== null) return { ...ds, students: ds.students.filter((s) => s.unit === sc.unit) };
  if (sc.school !== null) return { ...ds, students: ds.students.filter((s) => ds.units[s.unit].school === sc.school) };
  return ds;
}

export function applyFilter(ds: Dataset, f: Filter): Dataset {
  if (f.loc === 'all' && f.lang === 'all') return ds;
  const keep = ds.units.map((u) => (f.loc === 'all' || u.urban === (f.loc === 'urban')) && (f.lang === 'all' || u.lang === f.lang));
  return { ...ds, students: ds.students.filter((s) => keep[s.unit]) };
}

// ================= 1–2. Тақырыптар =================

export type Status = 'hard' | 'watch' | 'ok' | 'nodata';

export interface TopicStat {
  i: number;
  n: number;
  units: number;
  mean: number;
  /** Меңгергендер үлесі, % */
  mastery: number;
  lo: number;
  hi: number;
  status: Status;
  /** Сенім аралығы шекті кесіп өтеді: мәртебе нақты емес */
  borderline: boolean;
  /** Сынып топтары арасындағы шашырау (меңгеру үлесінің SD-сы, п.п.) */
  spread: number;
  urban: number | null;
  rural: number | null;
  prereq: { i: number; r: number; mastery: number; root: boolean } | null;
}

const statusOf = (m: number): Status => (m < HARD ? 'hard' : m < WATCH ? 'watch' : 'ok');

/**
 * `local` — бір мектеп не сынып: сенім аралығы оқушыларды қайта іріктеумен есептеледі
 * және қорытынды үшін 10 оқушы жеткілікті. Әйтпесе — облыс: мектептерді қайта іріктеу.
 */
export function topicStats(ds: Dataset, opts: { local?: boolean } = {}): TopicStat[] {
  const r = rng(7);
  const nU = ds.units.length;
  const sch = schoolIndex(ds);
  const nS = Math.max(0, ...sch) + 1;
  const out: TopicStat[] = ds.topics.map((_, i) => {
    const pass = new Array<number>(nU).fill(0);
    const cnt = new Array<number>(nU).fill(0);
    const scores: number[] = [];
    for (const s of ds.students) {
      const v = s.scores[i];
      if (Number.isNaN(v)) continue;
      scores.push(v);
      cnt[s.unit]++;
      if (v >= PASS) pass[s.unit]++;
    }
    const used = cnt.map((c, u) => (c > 0 ? u : -1)).filter((u) => u >= 0);
    const n = scores.length;
    const share = (us: number[]) => {
      const c = sum(us.map((u) => cnt[u]));
      return c ? (100 * sum(us.map((u) => pass[u]))) / c : NaN;
    };
    const mastery = share(used);
    const enough = opts.local ? n >= MIN_LOCAL : n >= MIN_STUDENTS && used.length >= MIN_UNITS;
    if (!enough) {
      return { i, n, units: used.length, mean: mean(scores), mastery, lo: NaN, hi: NaN, status: 'nodata' as Status, borderline: false, spread: 0, urban: null, rural: null, prereq: null };
    }
    const boot: number[] = [];
    if (opts.local) {
      // Сенім аралығы: оқушыларды қайта іріктеу
      const passed = scores.map((v) => (v >= PASS ? 1 : 0));
      for (let b = 0; b < 400; b++) {
        let p = 0;
        for (let k = 0; k < n; k++) p += passed[Math.floor(r() * n)];
        boot.push((100 * p) / n);
      }
    } else {
      // Сенім аралығы: мектептерді қайта іріктеу (кластерлік бутстрэп)
      const sp = new Array<number>(nS).fill(0);
      const sc = new Array<number>(nS).fill(0);
      for (const u of used) {
        sp[sch[u]] += pass[u];
        sc[sch[u]] += cnt[u];
      }
      const schools = sc.map((c, k) => (c > 0 ? k : -1)).filter((k) => k >= 0);
      for (let b = 0; b < 400; b++) {
        let p = 0;
        let c = 0;
        for (let k = 0; k < schools.length; k++) {
          const q = schools[Math.floor(r() * schools.length)];
          p += sp[q];
          c += sc[q];
        }
        boot.push((100 * p) / c);
      }
    }
    boot.sort((a, b) => a - b);
    const lo = quantile(boot, 0.025);
    const hi = quantile(boot, 0.975);
    const st = statusOf(mastery);
    const urbanUs = used.filter((u) => ds.units[u].urban);
    const ruralUs = used.filter((u) => !ds.units[u].urban);
    return {
      i,
      n,
      units: used.length,
      mean: mean(scores),
      mastery,
      lo,
      hi,
      status: st,
      borderline: statusOf(lo) !== st || statusOf(hi) !== st,
      spread: sd(used.filter((u) => cnt[u] >= 5).map((u) => (100 * pass[u]) / cnt[u])),
      urban: urbanUs.length >= 3 ? share(urbanUs) : null,
      rural: ruralUs.length >= 3 ? share(ruralUs) : null,
      prereq: null,
    };
  });

  // Тірек тақырыппен байланыс: бастапқы деңгейді есептен шығарғандағы корреляция
  ds.topics.forEach((t, i) => {
    const pi = ds.topics.findIndex((x) => x.id === t.prereq[0]);
    if (pi < 0 || out[i].status === 'nodata' || out[pi].status === 'nodata') return;
    const rows = ds.students.filter((s) => !Number.isNaN(s.scores[i]) && !Number.isNaN(s.scores[pi]));
    if (rows.length < MIN_STUDENTS) return;
    const resid = (k: number) => {
      const y = rows.map((s) => s.scores[k]);
      if (!ds.hasBaseline) return y;
      const fit = ols(rows.map((s) => [1, s.baseline]), y);
      return fit ? y.map((v, j) => v - fit.beta[0] - fit.beta[1] * rows[j].baseline) : y;
    };
    const rr = pearson(resid(i), resid(pi));
    out[i].prereq = { i: pi, r: rr, mastery: out[pi].mastery, root: out[i].status !== 'ok' && out[pi].status !== 'ok' && rr >= 0.3 };
  });
  return out;
}

// ================= 3. Оқулықтар =================

export type Verdict = 'ref' | 'better' | 'worse' | 'unproven' | 'nodata';

export interface TextbookRow {
  name: string;
  n: number;
  units: number;
  rawMean: number;
  /** Қарапайым айырма: орташа баллдардың айырмасы (негізгі оқулыққа қатысты) */
  naive: number | null;
  /** Түзетілген әсер, балл */
  adj: number | null;
  lo: number | null;
  hi: number | null;
  p: number | null;
  /** Әсер стандарт ауытқу бірлігінде */
  sdUnits: number | null;
  verdict: Verdict;
  /** Қарапайым салыстыру мен түзетілген салыстыру қарама-қарсы қорытынды береді */
  flipped: boolean;
}

export interface TextbookResult {
  ref: string;
  rows: TextbookRow[];
  /** Қандай факторларға түзетілді */
  controls: ('baseline' | 'urban' | 'lang')[];
  outcomeSd: number;
}

export function compareTextbooks(ds: Dataset, refName?: string, topicIdx?: number[]): TextbookResult | null {
  const idx = topicIdx ?? ds.topics.map((_, i) => i);
  const rows = ds.students
    .map((s) => {
      const v = idx.map((i) => s.scores[i]).filter((x) => !Number.isNaN(x));
      return { s, y: v.length ? mean(v) : NaN };
    })
    .filter((x) => !Number.isNaN(x.y) && (!ds.hasBaseline || !Number.isNaN(x.s.baseline)));
  if (!rows.length) return null;

  const names = [...new Set(rows.map((x) => ds.units[x.s.unit].textbook))].sort();
  const info = names.map((name) => {
    const mine = rows.filter((x) => ds.units[x.s.unit].textbook === name);
    return { name, n: mine.length, units: new Set(mine.map((x) => x.s.unit)).size, rawMean: mean(mine.map((x) => x.y)) };
  });
  const enough = info.filter((t) => t.n >= MIN_STUDENTS && t.units >= MIN_UNITS);
  const ref = enough.find((t) => t.name === refName) ?? [...enough].sort((a, b) => b.n - a.n)[0];
  if (!ref) {
    return { ref: '', controls: [], outcomeSd: sd(rows.map((x) => x.y)), rows: info.map((t) => ({ ...t, naive: null, adj: null, lo: null, hi: null, p: null, sdUnits: null, verdict: 'nodata', flipped: false })) };
  }
  const others = enough.filter((t) => t.name !== ref.name);
  const used = rows.filter((x) => enough.some((t) => t.name === ds.units[x.s.unit].textbook));

  // Тек өзгермелі факторларды қосамыз (әйтпесе матрица айналмайды)
  const controls: TextbookResult['controls'] = [];
  if (ds.hasBaseline) controls.push('baseline');
  const varies = (f: (u: Dataset['units'][number]) => boolean) => new Set(used.map((x) => f(ds.units[x.s.unit]))).size > 1;
  if (varies((u) => u.urban)) controls.push('urban');
  if (varies((u) => u.lang === 'ru')) controls.push('lang');

  const X = used.map((x) => {
    const u = ds.units[x.s.unit];
    const row = [1, ...others.map((t) => (u.textbook === t.name ? 1 : 0))];
    if (controls.includes('baseline')) row.push(x.s.baseline);
    if (controls.includes('urban')) row.push(u.urban ? 1 : 0);
    if (controls.includes('lang')) row.push(u.lang === 'ru' ? 1 : 0);
    return row;
  });
  const y = used.map((x) => x.y);
  const sch = schoolIndex(ds);
  const fit = others.length ? ols(X, y, used.map((x) => sch[x.s.unit])) : null;
  const outcomeSd = sd(y);

  return {
    ref: ref.name,
    controls,
    outcomeSd,
    rows: info.map((t) => {
      const blank = { ...t, naive: null, adj: null, lo: null, hi: null, p: null, sdUnits: null, flipped: false };
      if (t.name === ref.name) return { ...blank, naive: 0, adj: 0, verdict: 'ref' as Verdict };
      const k = others.findIndex((o) => o.name === t.name);
      if (k < 0 || !fit) return { ...blank, verdict: 'nodata' as Verdict };
      const adj = fit.beta[k + 1];
      const half = fit.half[k + 1];
      const p = fit.p[k + 1];
      const naive = t.rawMean - ref.rawMean;
      // Бастапқы деңгей белгісіз болса, айырмашылықты оқулыққа таңуға болмайды
      const sig = p < 0.05 && ds.hasBaseline;
      return {
        ...t,
        naive,
        adj,
        lo: adj - half,
        hi: adj + half,
        p,
        sdUnits: outcomeSd > 0 ? adj / outcomeSd : null,
        verdict: (sig ? (adj > 0 ? 'better' : 'worse') : 'unproven') as Verdict,
        flipped: Math.abs(naive) >= 1 && Math.sign(naive) !== Math.sign(adj) && Math.abs(adj) >= 1,
      };
    }),
  };
}

export interface SectionCell {
  section: string;
  rows: TextbookRow[];
}

/** Оқулық әсері бөлімдер бойынша: оқулықтың қай бөлімі күшті не әлсіз */
export function textbooksBySection(ds: Dataset, lang: 'kk' | 'ru', refName?: string): SectionCell[] {
  const sections = [...new Set(ds.topics.map((t) => t.section[lang]))];
  return sections.map((section) => {
    const idx = ds.topics.map((t, i) => (t.section[lang] === section ? i : -1)).filter((i) => i >= 0);
    return { section, rows: compareTextbooks(ds, refName, idx)?.rows ?? [] };
  });
}

// ================= 4. Сағаттар =================

export type Evidence = 'strong' | 'weak' | 'none';

export interface HourTopic {
  i: number;
  planned: number;
  min: number;
  max: number;
  /** ln(сағат) коэффициенті: сағат e есе өскенде балл қаншаға өседі */
  slope: number | null;
  se: number | null;
  /** Ұсынысқа қолданылатын, ортаққа «сығылған» және теріс емес коэффициент */
  gain: number;
  evidence: Evidence;
  /** Жоспарға +1 сағат қосқанда күтілетін өсім, балл */
  perHour: number;
  units: number;
}

export interface HourModel {
  topics: HourTopic[];
  total: number;
}

export function fitHours(ds: Dataset): HourModel {
  const nU = ds.units.length;
  const fits = ds.topics.map((t, i) => {
    const acc = Array.from({ length: nU }, () => ({ y: 0, b: 0, n: 0 }));
    for (const s of ds.students) {
      const v = s.scores[i];
      if (Number.isNaN(v)) continue;
      const a = acc[s.unit];
      a.y += v;
      a.b += ds.hasBaseline && !Number.isNaN(s.baseline) ? s.baseline : 0;
      a.n++;
    }
    const us = acc.map((a, u) => ({ a, u })).filter(({ a, u }) => a.n >= 5 && ds.units[u].hours[i] > 0);
    const hs = us.map(({ u }) => ds.units[u].hours[i]);
    const obsMin = hs.length ? Math.min(...hs) : t.planned;
    const obsMax = hs.length ? Math.max(...hs) : t.planned;
    let slope: number | null = null;
    let se: number | null = null;
    if (us.length >= 12 && obsMax > obsMin) {
      const urbanVaries = new Set(us.map(({ u }) => ds.units[u].urban)).size > 1;
      const X = us.map(({ a, u }) => {
        const row = [1, Math.log(ds.units[u].hours[i])];
        if (ds.hasBaseline) row.push(a.b / a.n);
        if (urbanVaries) row.push(ds.units[u].urban ? 1 : 0);
        return row;
      });
      const fit = ols(X, us.map(({ a }) => a.y / a.n));
      if (fit) {
        slope = fit.beta[1];
        se = fit.se[1];
      }
    }
    // Шектер: жоспардан ±30% (кемінде ±1 сағат) және деректе бақыланған аралықтан аспайды
    const lo = Math.max(1, Math.min(t.planned - 1, Math.ceil(t.planned * 0.7)), Math.min(obsMin, t.planned));
    const hi = Math.min(Math.max(t.planned + 1, Math.floor(t.planned * 1.3)), Math.max(obsMax, t.planned));
    return { i, planned: t.planned, min: lo, max: hi, slope, se, units: us.length };
  });

  // Эмпирикалық Байес: шулы бағаларды ортақ орташаға қарай сығамыз
  const ok = fits.filter((f) => f.slope !== null && f.se !== null && f.se > 0);
  const prior = ok.length ? sum(ok.map((f) => f.slope! / f.se! ** 2)) / sum(ok.map((f) => 1 / f.se! ** 2)) : 0;
  const tau2 = ok.length > 2 ? Math.max(0, sd(ok.map((f) => f.slope!)) ** 2 - mean(ok.map((f) => f.se! ** 2))) : 0;

  const topics: HourTopic[] = fits.map((f) => {
    if (f.slope === null || f.se === null) return { ...f, gain: 0, evidence: 'none' as Evidence, perHour: 0 };
    const w = tau2 / (tau2 + f.se ** 2);
    const shrunk = prior + w * (f.slope - prior);
    const evidence: Evidence = f.slope - 1.96 * f.se > 0 ? 'strong' : f.slope > 0 && shrunk > 0 ? 'weak' : 'none';
    const gain = evidence === 'none' ? 0 : Math.max(0, shrunk);
    return { ...f, gain, evidence, perHour: gain * Math.log((f.planned + 1) / f.planned) };
  });
  return { topics, total: sum(ds.topics.map((t) => t.planned)) };
}

const WEIGHT: Record<Status, number> = { hard: 2, watch: 1.5, ok: 1, nodata: 1 };

/**
 * Жалпы сағатты сақтай отырып, сағатты «пайдасы аз» тақырыптан «пайдасы көп» тақырыпқа
 * бір-бірлеп жылжытамыз. Сағат тек жақсы меңгерілген тақырыптан алынады; құлыпталған тақырып өзгермейді.
 */
export function recommendHours(model: HourModel, stats: { status: Status }[], locked: Set<number> = new Set(), start?: number[]): number[] {
  const h = model.topics.map((t, i) => (locked.has(i) && start ? start[i] : t.planned));
  // Құлыпталған тақырыптар жалпы соманы бұзса, теңгерімді қалғандары есебінен қалпына келтіреміз
  let diff = model.total - sum(h);
  for (let guard = 0; diff !== 0 && guard < 200; guard++) {
    const step = Math.sign(diff);
    const cand = model.topics.filter((t) => !locked.has(t.i) && (step > 0 ? h[t.i] < t.max : h[t.i] > t.min));
    if (!cand.length) break;
    cand.sort((a, b) => (step > 0 ? b.gain - a.gain : a.gain - b.gain));
    h[cand[0].i] += step;
    diff -= step;
  }
  for (let move = 0; move < 60; move++) {
    let best: { to: number; from: number; net: number } | null = null;
    for (const to of model.topics) {
      if (locked.has(to.i) || h[to.i] >= to.max || to.gain <= 0) continue;
      const g = WEIGHT[stats[to.i].status] * to.gain * Math.log((h[to.i] + 1) / h[to.i]);
      for (const from of model.topics) {
        if (from.i === to.i || locked.has(from.i) || h[from.i] <= from.min || stats[from.i].status !== 'ok') continue;
        const loss = WEIGHT[stats[from.i].status] * from.gain * Math.log(h[from.i] / (h[from.i] - 1));
        if (!best || g - loss > best.net) best = { to: to.i, from: from.i, net: g - loss };
      }
    }
    if (!best || best.net < 0.25) break;
    h[best.to]++;
    h[best.from]--;
  }
  return h;
}

export interface HoursEffect {
  /** Әр тақырып бойынша күтілетін өзгеріс, балл */
  per: { delta: number; half: number }[];
  /** Барлық тақырып бойынша орташа өзгеріс */
  avg: number;
  avgHalf: number;
}

export function predictEffect(model: HourModel, hours: number[]): HoursEffect {
  const per = model.topics.map((t, i) => {
    const lr = Math.log(hours[i] / t.planned);
    return { delta: t.gain * lr, half: t.se !== null ? 1.96 * t.se * Math.abs(lr) : 0 };
  });
  return { per, avg: mean(per.map((p) => p.delta)), avgHalf: Math.sqrt(sum(per.map((p) => p.half ** 2))) / per.length };
}
