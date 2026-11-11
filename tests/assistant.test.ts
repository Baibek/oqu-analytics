import { describe, expect, it } from 'vitest';
import { COURSES, generateCourse, generateDemo } from '../src/lib/generate';
import { applyScope, compareTextbooks, fitHours, recommendHours, topicStats } from '../src/lib/analysis';
import { answer, AssistContext, contextForModel, matchTopic, rankUnits, suggestions, wordMatch } from '../src/lib/assistant';

const ds = generateDemo();
const stats = topicStats(ds);
const model = fitHours(ds);
const base = (lang: 'kk' | 'ru' = 'kk'): AssistContext => ({ lang, ds, region: ds, stats, regionStats: stats, textbooks: compareTextbooks(ds, 'Оқулық A'), model, recommended: recommendHours(model, stats), scopeLabel: null });
const all = (r: ReturnType<typeof answer>) => r.text.join(' ');

describe('ИИ көмекші (офлайн)', () => {
  it('тақырыпты қысқа атауы бойынша табады', () => {
    const i = (id: string) => ds.topics.findIndex((t) => t.id === id);
    expect(matchTopic('Ом заңы неге қиын?', ds, 'kk')).toBe(i('t14'));
    expect(matchTopic('Почему трудна тема про закон Ома?', ds, 'ru')).toBe(i('t14'));
    expect(matchTopic('Кулон заңы', ds, 'kk')).toBe(i('t10'));
    expect(matchTopic('Сағатты қалай бөлген жөн?', ds, 'kk')).toBe(null);
  });

  it('қиын тақырыптар туралы сұраққа нақты сандармен жауап береді', () => {
    const r = answer('Ең қиын тақырыптар қандай?', base());
    const worst = stats.filter((s) => s.status === 'hard').sort((a, b) => a.mastery - b.mastery)[0];
    expect(all(r)).toContain(ds.topics[worst.i].name.kk);
    expect(all(r)).toContain(`${worst.mastery.toFixed(0)}%`);
    expect(r.actions[0].tab).toBe('topics');
  });

  it('тақырып туралы сұраққа себебін айтады', () => {
    const r = answer('Өткізгіштерді тізбектей қосу неге қиын?', base());
    expect(all(r)).toContain('Ом заңы');
    expect(r.actions[0].topic).toBe(ds.topics.findIndex((t) => t.id === 't15'));
  });

  it('оқулық пен сағат сұрақтарын ажыратады', () => {
    const b = answer('Қай оқулық тиімдірек?', base());
    expect(all(b)).toContain('Оқулық B');
    expect(all(b)).toContain('мәнді жоғары');
    expect(all(b)).toContain('мектептер айырмасы');
    const h = answer('Как распределить часы?', base('ru'));
    expect(h.actions[0].tab).toBe('hours');
    expect(all(h)).toContain('68');
  });

  it('ең әлсіз мектептерді атайды және оларға өтуге болады', () => {
    const r = answer('Ең әлсіз мектептер', base());
    const ranked = rankUnits(ds, 'school');
    expect(all(r)).toContain(ranked[0].school);
    expect(r.actions[0].scope?.school).toBe(ranked[0].school);
    expect(ranked[0].mastery).toBeLessThanOrEqual(ranked[ranked.length - 1].mastery);
  });

  it('сынып таңдалғанда облыспен салыстырады, түсініксіз сұраққа анықтама береді', () => {
    const u = ds.units.findIndex((x) => x.urban);
    const cls = applyScope(ds, { school: null, unit: u });
    const ls = topicStats(cls, { local: true });
    const r = answer('Ом заңы', { ...base(), ds: cls, stats: ls, recommended: recommendHours(model, ls), scopeLabel: 'Тест' });
    expect(all(r)).toContain('Облыс бойынша');
    expect(answer('сәлем', base()).actions).toEqual([]);
    expect(JSON.parse(contextForModel(base())).topics.length).toBe(ds.topics.length);
  });

  it('жалғау мен қате теруге төзімді', () => {
    const i = (id: string) => ds.topics.findIndex((t) => t.id === id);
    expect(matchTopic('Ом заңын', ds)).toBe(i('t14'));
    expect(matchTopic('Кулон заңына', ds)).toBe(i('t10'));
    expect(matchTopic('закону кулона', ds)).toBe(i('t10'));
    expect(matchTopic('конденсаторлардың', ds)).toBe(i('t12'));
    expect(matchTopic('кондесатор', ds)).toBe(i('t12'));
    expect(matchTopic('паралельное соединение', ds)).toBe(i('t15'));
    expect(wordMatch('салем', 'салу')).toBe(0);
    expect(matchTopic('сәлем', ds)).toBe(null);
  });

  it('ойдан сан қоспайды: модель аралығынан тыс сағатқа болжам бермейді', () => {
    const r = answer('Ом заңына 10 сағат қоссақ?', base());
    const h = model.topics[ds.topics.findIndex((t) => t.id === 't14')];
    expect(r.intent).toBe('whatif');
    expect(all(r)).toContain(`${h.planned} → ${h.max}`);
    expect(all(r)).toContain('аралықтан тыс');
    expect(answer('№99 мектеп қалай?', base()).actions.some((a) => a.scope)).toBe(false);
  });

  it('Claude контекстінде бөлімдер мен мектептердің әлсіз тақырыптары бар', () => {
    const j = JSON.parse(contextForModel(base()));
    expect(j.sections.length).toBe(new Set(ds.topics.map((t) => t.section.kk)).size);
    expect(j.weakest_schools[0].most_behind_region.length).toBeGreaterThan(0);
    expect(j.topics[0].hours_trusted_range).toHaveLength(2);
  });

  it('барлық курста ұсынылатын сұрақтар жауапсыз қалмайды', () => {
    for (const spec of COURSES) {
      const d = generateCourse(spec);
      const st = topicStats(d);
      const m = fitHours(d);
      for (const lang of ['kk', 'ru'] as const) {
        const c: AssistContext = { lang, ds: d, region: d, stats: st, regionStats: st, textbooks: compareTextbooks(d), model: m, recommended: recommendHours(m, st), scopeLabel: null };
        for (const q of suggestions(c)) {
          const r = answer(q, c);
          expect(r.intent, `${spec.key}: ${q}`).not.toBe('help');
          expect(r.text.length, `${spec.key}: ${q}`).toBeLessThanOrEqual(7);
          expect(r.text.join(' '), `${spec.key}: ${q}`).not.toMatch(/NaN|undefined/);
        }
      }
    }
  });
});
