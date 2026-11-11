import { describe, expect, it } from 'vitest';
import { gauss, ols, rng, tCdf, tQuantile } from '../src/lib/stats';
import { COURSES, generateCourse, generateDemo, TRUTH } from '../src/lib/generate';
import { applyFilter, applyScope, compareTextbooks, fitHours, predictEffect, recommendHours, textbooksBySection, topicStats } from '../src/lib/analysis';
import { exportCurriculum, exportResults, importCatalog, importData, parseCsv, toCsv } from '../src/lib/csv';
import { sum } from '../src/lib/stats';

describe('статистика', () => {
  it('t-үлестірімі анықтамалық мәндерге сәйкес', () => {
    expect(tCdf(0, 10)).toBeCloseTo(0.5, 6);
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228, 2);
    expect(tQuantile(0.975, 60)).toBeCloseTo(2.0, 2);
    expect(tQuantile(0.975, 1000)).toBeCloseTo(1.962, 2);
  });

  it('регрессия белгілі коэффициенттерді қалпына келтіреді', () => {
    const r = rng(1);
    const X: number[][] = [];
    const y: number[] = [];
    const cl: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const a = gauss(r);
      const b = r() < 0.4 ? 1 : 0;
      X.push([1, a, b]);
      y.push(10 + 2.5 * a - 4 * b + gauss(r));
      cl.push(i % 50);
    }
    const fit = ols(X, y, cl)!;
    expect(fit.beta[0]).toBeCloseTo(10, 0);
    expect(fit.beta[1]).toBeCloseTo(2.5, 1);
    expect(fit.beta[2]).toBeCloseTo(-4, 1);
    expect(fit.p[2]).toBeLessThan(0.001);
    expect(fit.df).toBe(49);
  });

  it('жоқ әсерді «мәнді» деп сирек жариялайды (жалған дабыл ≈ 5%)', () => {
    const r = rng(5);
    let hits = 0;
    for (let rep = 0; rep < 300; rep++) {
      const X: number[][] = [];
      const y: number[] = [];
      const cl: number[] = [];
      for (let g = 0; g < 40; g++) {
        const treat = g % 2;
        const q = gauss(r) * 4; // мектеп әсері: оқушылар тәуелсіз емес
        for (let i = 0; i < 20; i++) {
          X.push([1, treat]);
          y.push(q + gauss(r) * 10);
          cl.push(g);
        }
      }
      if (ols(X, y, cl)!.p[1] < 0.05) hits++;
    }
    expect(hits / 300).toBeLessThan(0.09);
  });
});

describe('демо дерегіндегі салынған жауаптар', () => {
  const ds = generateDemo();
  const stats = topicStats(ds);

  it('қиын тақырыптар табылады, оңайлары қиын деп белгіленбейді', () => {
    const by = (id: string) => stats[ds.topics.findIndex((t) => t.id === id)];
    expect(by('t15').status).toBe('hard');
    expect(by('t01').status).toBe('ok');
    expect(by('t15').lo).toBeLessThan(by('t15').mastery);
    expect(by('t15').hi).toBeGreaterThan(by('t15').mastery);
    expect(by('t15').prereq?.r).toBeGreaterThan(0.25);
  });

  it('оқулық: қарапайым салыстыру қате бағыт береді, түзетілгені дұрысын табады', () => {
    const res = compareTextbooks(ds, 'Оқулық A')!;
    const b = res.rows.find((r) => r.name === 'Оқулық B')!;
    expect(b.naive!).toBeLessThan(0);
    expect(b.adj!).toBeGreaterThan(0);
    expect(b.lo!).toBeLessThan(TRUTH.textbook['Оқулық B'] + TRUTH.bCurrentBonus * (17 / 68) + 1.5);
    expect(b.hi!).toBeGreaterThan(TRUTH.textbook['Оқулық B']);
    expect(b.verdict).toBe('better');
    expect(b.flipped).toBe(true);
  });

  it('оқулық: жоқ айырмашылық «дәлелденбеген», аз дерек «жеткіліксіз»', () => {
    const res = compareTextbooks(ds, 'Оқулық A')!;
    expect(res.rows.find((r) => r.name === 'Оқулық C')!.verdict).toBe('unproven');
    expect(res.rows.find((r) => r.name === 'Оқулық D')!.verdict).toBe('nodata');
  });

  it('оқулық: B-ның артықшылығы «Тұрақты электр тогы» бөлімінде ең үлкен', () => {
    const cells = textbooksBySection(ds, 'ru', 'Оқулық A').map((c) => ({ s: c.section, adj: c.rows.find((r) => r.name === 'Оқулық B')!.adj! }));
    const top = [...cells].sort((a, b) => b.adj - a.adj)[0];
    expect(top.s).toContain('Постоянный');
  });

  it('сағат: сезімтал тақырыптарға дәлел күшті, сезімтал еместерге жоқ', () => {
    const m = fitHours(ds);
    const by = (id: string) => m.topics[ds.topics.findIndex((t) => t.id === id)];
    expect(by('t14').evidence).toBe('strong');
    expect(by('t15').evidence).toBe('strong');
    expect(by('t14').slope!).toBeGreaterThan(12);
    expect(by('t14').gain).toBeGreaterThan(by('t01').gain);
  });

  it('сағат ұсынысы: жалпы сома сақталады, шектер бұзылмайды, әлсіз тақырып қысқармайды', () => {
    const m = fitHours(ds);
    const h = recommendHours(m, stats);
    expect(sum(h)).toBe(m.total);
    m.topics.forEach((t, i) => {
      expect(h[i]).toBeGreaterThanOrEqual(t.min);
      expect(h[i]).toBeLessThanOrEqual(t.max);
      if (stats[i].status !== 'ok') expect(h[i]).toBeGreaterThanOrEqual(t.planned);
    });
    expect(h[ds.topics.findIndex((t) => t.id === 't15')]).toBeGreaterThan(5);
    expect(predictEffect(m, h).avg).toBeGreaterThan(0);
    expect(predictEffect(m, m.topics.map((t) => t.planned)).avg).toBe(0);
  });

  it('сағат ұсынысы: құлыпталған тақырып өзгермейді', () => {
    const m = fitHours(ds);
    const i15 = ds.topics.findIndex((t) => t.id === 't15');
    const start = m.topics.map((t) => t.planned);
    const h = recommendHours(m, stats, new Set([i15]), start);
    expect(h[i15]).toBe(start[i15]);
    expect(sum(h)).toBe(m.total);
  });

  it('сүзгі: аз дерек қалғанда қорытынды жасалмайды', () => {
    const small = { ...ds, students: ds.students.filter((s) => s.unit < 3) };
    expect(topicStats(small).every((s) => s.status === 'nodata')).toBe(true);
    expect(applyFilter(ds, { loc: 'urban', lang: 'all' }).students.length).toBeLessThan(ds.students.length);
  });
});

describe('CSV', () => {
  it('тырнақша мен үтірлі нүктені түсінеді', () => {
    expect(parseCsv('a;b\n"x;1";2\n')).toEqual([['a', 'b'], ['x;1', '2']]);
    expect(parseCsv('a,b\n"he said ""hi""",2')).toEqual([['a', 'b'], ['he said "hi"', '2']]);
  });

  it('экспорт → импорт дерегі талдауды өзгертпейді', () => {
    const ds = generateDemo();
    const { ds: back, issues } = importData(exportResults(ds, 'kk'), exportCurriculum(ds, 'kk'));
    expect(issues).toEqual([]);
    expect(back!.students.length).toBe(ds.students.length);
    expect(back!.topics.map((t) => t.planned)).toEqual(ds.topics.map((t) => t.planned));
    expect(topicStats(back!).map((s) => Math.round(s.mastery))).toEqual(topicStats(ds).map((s) => Math.round(s.mastery)));
  });

  it('қате файлға түсінікті қате қайтарады', () => {
    expect(importData('school,score\nA,5').issues[0].code).toBe('missing_cols');
    const bad = importData('student_id,school,textbook,topic,score\n1,A,T,Тақырып,150\n2,A,T,Тақырып,70');
    expect(bad.issues.some((i) => i.code === 'bad_score')).toBe(true);
    expect(bad.ds!.hasBaseline).toBe(false);
  });
});

describe('пәндер, параллельдер, сыныптар', () => {
  it('әр курс дерегі жасалады және талдауға жарамды', () => {
    for (const spec of COURSES) {
      const ds = generateCourse(spec);
      expect(ds.subject.kk).toBe(spec.subject.kk);
      expect(ds.units.every((u) => u.name.startsWith(String(spec.grade)))).toBe(true);
      const st = topicStats(ds);
      expect(st.filter((x) => x.status !== 'nodata').length).toBe(spec.topics.length);
      const m = fitHours(ds);
      expect(sum(recommendHours(m, st))).toBe(m.total);
    }
  });

  it('бір сынып таңдалғанда тақырыптар сол сыныптың дерегімен есептеледі', () => {
    const ds = generateDemo();
    const u = ds.units.findIndex((x) => x.urban);
    const cls = applyScope(ds, { school: null, unit: u });
    expect(cls.students.every((s) => s.unit === u)).toBe(true);
    const local = topicStats(cls, { local: true });
    expect(local.every((x) => x.status !== 'nodata')).toBe(true);
    expect(local.every((x) => x.lo <= x.mastery && x.mastery <= x.hi)).toBe(true);
    // Облыстық режимде бір сынып қорытындыға жеткіліксіз
    expect(topicStats(cls).every((x) => x.status === 'nodata')).toBe(true);
    const school = applyScope(ds, { school: ds.units[u].school, unit: null });
    expect(new Set(school.students.map((s) => s.unit)).size).toBeGreaterThan(1);
  });

  it('бірнеше пән мен параллель бар файл курстарға бөлінеді', () => {
    const a = generateCourse(COURSES.find((c) => c.key === 'alg-7')!);
    const b = generateCourse(COURSES.find((c) => c.key === 'chem-9')!);
    const ra = parseCsv(exportResults(a, 'kk', 6));
    const rb = parseCsv(exportResults(b, 'kk', 6));
    const pa = parseCsv(exportCurriculum(a, 'kk'));
    const pb = parseCsv(exportCurriculum(b, 'kk'));
    const { courses, issues } = importCatalog(toCsv([...ra, ...rb.slice(1)]), toCsv([...pa, ...pb.slice(1)]));
    expect(issues).toEqual([]);
    expect(courses.map((c) => `${c.ds.subject.kk} ${c.ds.grade}`).sort()).toEqual(['Алгебра 7', 'Химия 9']);
    const alg = courses.find((c) => c.ds.grade === 7)!.ds;
    expect(alg.topics.length).toBe(a.topics.length);
    expect(alg.units.map((u) => u.name)).toEqual(a.units.slice(0, 6).map((u) => u.name));
  });
});
