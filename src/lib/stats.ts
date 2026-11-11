// Статистикалық негіз: сыртқы кітапханасыз, тесттермен тексерілген.

export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);

export function sd(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function pearson(x: number[], y: number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Қайталанатын кездейсоқ сандар (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// ---- Стьюдент t-үлестірімі (толық емес бета-функция арқылы) ----

function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const cj of c) ser += cj / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return h;
}

function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const p = 0.5 * ibeta(df / 2, 0.5, x);
  return t >= 0 ? 1 - p : p;
}

/** Екі жақты p-мән */
export const tPValue = (t: number, df: number) => 2 * (1 - tCdf(Math.abs(t), df));

export function tQuantile(p: number, df: number): number {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---- Сызықтық регрессия ----

function invert(m: number[][]): number[][] | null {
  const k = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-9) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * k; j++) a[c][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (f === 0) continue;
      for (let j = 0; j < 2 * k; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row) => row.slice(k));
}

export interface OlsResult {
  beta: number[];
  se: number[];
  /** Сенім аралығы мен p-мәнге қолданылатын еркіндік дәрежесі */
  df: number;
  p: number[];
  /** 95% аралықтың жарты ені */
  half: number[];
  n: number;
}

/**
 * Ең кіші квадраттар әдісі. `cluster` берілсе, стандарт қателер кластерге
 * (мектепке) орнықты: бір мектептің оқушылары тәуелсіз бақылау деп саналмайды.
 */
export function ols(X: number[][], y: number[], cluster?: number[]): OlsResult | null {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n <= k + 1) return null;
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    for (let a = 0; a < k; a++) {
      xty[a] += xi[a] * y[i];
      for (let b = a; b < k; b++) xtx[a][b] += xi[a] * xi[b];
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) xtx[a][b] = xtx[b][a];
  const inv = invert(xtx);
  if (!inv) return null;
  const beta = inv.map((row) => sum(row.map((v, j) => v * xty[j])));
  const resid = y.map((yi, i) => yi - sum(X[i].map((v, j) => v * beta[j])));

  let cov: number[][];
  let df: number;
  if (cluster) {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      let s = groups.get(cluster[i]);
      if (!s) groups.set(cluster[i], (s = new Array<number>(k).fill(0)));
      for (let a = 0; a < k; a++) s[a] += X[i][a] * resid[i];
    }
    const G = groups.size;
    if (G < 3) return null;
    const meat = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    for (const s of groups.values()) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) meat[a][b] += s[a] * s[b];
    const adj = (G / (G - 1)) * ((n - 1) / (n - k));
    const tmp = inv.map((row) => meat[0].map((_, j) => sum(row.map((v, m) => v * meat[m][j]))));
    cov = tmp.map((row) => inv[0].map((_, j) => adj * sum(row.map((v, m) => v * inv[m][j]))));
    df = G - 1;
  } else {
    df = n - k;
    const s2 = sum(resid.map((e) => e * e)) / df;
    cov = inv.map((row) => row.map((v) => v * s2));
  }
  const se = cov.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  const tq = tQuantile(0.975, df);
  return {
    beta,
    se,
    df,
    n,
    p: beta.map((b, i) => (se[i] > 0 ? tPValue(b / se[i], df) : 1)),
    half: se.map((s) => s * tq),
  };
}
