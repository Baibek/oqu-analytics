import { describe, expect, it } from 'vitest';
import { COURSES, generateCourse, generateDemo } from '../src/lib/generate';
import { applyScope, compareTextbooks, fitHours, recommendHours, topicStats } from '../src/lib/analysis';
import { answer, AssistContext, Intent, rankUnits } from '../src/lib/assistant';
import type { Dataset, Lang } from '../src/lib/types';

// Офлайн көмекшінің бағалау жиынтығы: әдіскердің шынайы сұрақтары (қазақша/орысша,
// қате терумен, жалғаулармен, қазақ әріптерінсіз). Әр сұраққа күтілетін ниет пен негізгі
// фактілер берілген. Дәлдік консольге шығады және ≥ 90% болуы тиіс.
// Бастапқы нұсқа (ниеттер қосылмай тұрғанда) алғашқы 56 сұрақтың 22-сін ғана дұрыс шешті (39%).

const region = (ds: Dataset) => {
  const stats = topicStats(ds);
  const model = fitHours(ds);
  return { stats, model, textbooks: compareTextbooks(ds, 'Оқулық A') };
};

const phys8 = generateDemo();
const R8 = region(phys8);
const phys9 = generateCourse(COURSES.find((c) => c.key === 'phys-9')!);
const R9 = region(phys9);

function ctx(lang: Lang, ds = phys8, R = R8, school: string | null = null): AssistContext {
  if (!school) return { lang, ds, region: ds, stats: R.stats, regionStats: R.stats, textbooks: R.textbooks, model: R.model, recommended: recommendHours(R.model, R.stats), scopeLabel: null };
  const sub = applyScope(ds, { school, unit: null });
  const st = topicStats(sub, { local: true });
  return { lang, ds: sub, region: ds, stats: st, regionStats: R.stats, textbooks: R.textbooks, model: R.model, recommended: recommendHours(R.model, st), scopeLabel: school };
}

const KK = ctx('kk');
const RU = ctx('ru');
const KK4 = ctx('kk', phys8, R8, '№4 мектеп');
const RU4 = ctx('ru', phys8, R8, '№4 мектеп');
const KK9 = ctx('kk', phys9, R9);

const ti = (id: string, ds = phys8) => ds.topics.findIndex((t) => t.id === id);
const worstSchool = rankUnits(phys8, 'school')[0].school;
const worstOnOhm = rankUnits(phys8, 'school', ti('t14'))[0].school;
const bestClass = [...rankUnits(phys8, 'class')].reverse()[0];
const maxOhm = R8.model.topics[ti('t14')].max;

interface Case {
  q: string;
  c: AssistContext;
  intent: Intent;
  /** Әрекет батырмасы ашатын тақырып id-і */
  topic?: string;
  /** Жауапта аталуы тиіс тақырыптар (id) */
  names?: string[];
  tab?: string;
  school?: string;
  unit?: string;
  /** Жауапта сан болуы тиіс */
  num?: boolean;
  has?: string[];
}

const CASES: Case[] = [
  // ---------- Қазақша ----------
  { q: 'Ең қиын тақырыптар қандай?', c: KK, intent: 'hard', tab: 'topics', num: true },
  { q: 'киын такырыптар кандай', c: KK, intent: 'hard', tab: 'topics', num: true },
  { q: 'Ом заңын неге нашар меңгерген?', c: KK, intent: 'topic', topic: 't14', num: true },
  { q: 'Кулон заңына қанша сағат керек?', c: KK, intent: 'whatif', topic: 't10', num: true },
  { q: 'Ом заңына 2 сағат қоссақ не болады?', c: KK, intent: 'whatif', topic: 't14', num: true, has: ['±'] },
  { q: 'Ом заңына 10 сағат қоссақ?', c: KK, intent: 'whatif', topic: 't14', num: true, has: [`${maxOhm}`] },
  { q: 'Линзалар тақырыбынан 1 сағат азайтсақ?', c: KK, intent: 'whatif', topic: 't20', num: true },
  { q: 'сагат коссак не болады', c: KK, intent: 'whatif', tab: 'hours', num: true },
  { q: 'Конденсаторлар тақырыбы қалай?', c: KK, intent: 'topic', topic: 't12', num: true },
  { q: 'Кондесатор', c: KK, intent: 'topic', topic: 't12', num: true },
  { q: 'Жылу балансы теңдеуі неге қиын', c: KK, intent: 'topic', topic: 't05', num: true },
  { q: 'Тұрақты электр тогы бөлімі', c: KK, intent: 'section', num: true, has: ['Тұрақты электр тогы'] },
  { q: 'Электростатика қалай меңгерілген?', c: KK, intent: 'section', num: true, has: ['Электростатика'] },
  { q: 'Ом заңы мен Кулон заңын салыстыр', c: KK, intent: 'compare', names: ['t14', 't10'], num: true },
  { q: 'Оқулықтарды салыстырып бер', c: KK, intent: 'textbooks', tab: 'textbooks', has: ['Оқулық B'] },
  { q: 'Ом заңы бойынша қай оқулық жақсы?', c: KK, intent: 'textbooks', tab: 'textbooks', names: ['t14'] },
  { q: 'Сағатты қалай бөлген жөн?', c: KK, intent: 'hours', tab: 'hours', num: true },
  { q: 'Қай мектепте нашар?', c: KK, intent: 'ranking', school: worstSchool, num: true },
  { q: 'Ең мықты сыныптар қайсы?', c: KK, intent: 'ranking', school: bestClass.school, unit: bestClass.unit!, num: true },
  { q: 'Ом заңы қай мектепте нашар?', c: KK, intent: 'ranking', school: worstOnOhm, names: ['t14'], num: true },
  { q: '№5 мектеп қалай оқиды?', c: KK, intent: 'unit', school: '№5 мектеп', num: true },
  { q: '12 мектептің әлсіз тақырыптары', c: KK, intent: 'unit', school: '№12 мектеп', num: true },
  { q: '8Ә сыныбы қалай?', c: KK4, intent: 'unit', school: '№4 мектеп', unit: '8Ә', num: true },
  { q: '9Ә сыныбы қалай?', c: KK9, intent: 'unit', num: true, has: ['9Ә'] },
  { q: 'Не істеу керек?', c: KK, intent: 'todo', num: true },
  { q: 'Сәлем!', c: KK, intent: 'smalltalk' },
  { q: 'Рахмет', c: KK, intent: 'smalltalk' },
  { q: 'Сенім аралығы деген не?', c: KK, intent: 'term' },
  { q: 'Ертең ауа райы қандай болады?', c: KK, intent: 'help' },
  { q: 'Ом заңына екі сағат қосайық', c: KK, intent: 'whatif', topic: 't14', num: true, has: ['→'] },
  { q: 'Жарықтың сынуы', c: KK, intent: 'topic', topic: 't19', num: true },
  { q: 'Булану мен қайнау', c: KK, intent: 'topic', topic: 't07', num: true },
  { q: 'Тізбектей қосуды қалай жақсартамыз', c: KK, intent: 'topic', topic: 't15', num: true },
  { q: 'линзалар мен жарықтың шағылуын салыстыр', c: KK, intent: 'compare', names: ['t19', 't20'], num: true },
  { q: 'ТЕрмодинамика бөлімі', c: KK, intent: 'section', num: true, has: ['Термодинамика негіздері'] },
  { q: 'Жылу құбылыстары бөліміне қай оқулық жақсы', c: KK, intent: 'textbooks', tab: 'textbooks', has: ['Жылу құбылыстары'] },
  { q: 'сабақ сағатын қалай өзгерту керек', c: KK, intent: 'hours', tab: 'hours', num: true },
  { q: '4 мектептің 8Б сыныбы', c: KK, intent: 'unit', school: '№4 мектеп', unit: '8Б', num: true },
  { q: 'Облыспен салыстырғанда әлсіз тақырыптар', c: KK4, intent: 'unit', school: '№4 мектеп', num: true },
  { q: 'Методистке не ұсынасың?', c: KK, intent: 'todo', num: true },
  { q: 'қайырлы күн', c: KK, intent: 'smalltalk' },

  // ---------- Русский ----------
  { q: 'Какие темы самые сложные?', c: RU, intent: 'hard', tab: 'topics', num: true },
  { q: 'какие темы хуже всего усвоены', c: RU, intent: 'hard', tab: 'topics', num: true },
  { q: 'Почему не усваивают закон Ома?', c: RU, intent: 'topic', topic: 't14', num: true },
  { q: 'закону кулона', c: RU, intent: 'topic', topic: 't10', num: true },
  { q: 'Теплота сгорания топлива', c: RU, intent: 'topic', topic: 't05', num: true },
  { q: 'электромагнитная индукцыя', c: RU, intent: 'topic', topic: 't18', num: true },
  { q: 'последовательное и паралельное соединение почему сложно', c: RU, intent: 'topic', topic: 't15', num: true },
  { q: 'если добавить 2 часа на закон Ома', c: RU, intent: 'whatif', topic: 't14', num: true, has: ['±'] },
  { q: 'Что будет, если убрать час у темы Линзы?', c: RU, intent: 'whatif', topic: 't20', num: true },
  { q: 'Сколько часов нужно на конденсаторы?', c: RU, intent: 'whatif', topic: 't12', num: true },
  { q: 'раздел Постоянный электрический ток', c: RU, intent: 'section', num: true, has: ['Постоянный электрический ток'] },
  { q: 'Как дела с разделом электростатика?', c: RU, intent: 'section', num: true },
  { q: 'Сравни закон Ома и закон Кулона', c: RU, intent: 'compare', names: ['t14', 't10'], num: true },
  { q: 'Какой учебник лучше?', c: RU, intent: 'textbooks', tab: 'textbooks', has: ['Оқулық B'] },
  { q: 'какой учебник эффективнее по закону Ома', c: RU, intent: 'textbooks', tab: 'textbooks', names: ['t14'] },
  { q: 'Как перераспределить часы?', c: RU, intent: 'hours', tab: 'hours', num: true },
  { q: 'В какой школе хуже всего?', c: RU, intent: 'ranking', school: worstSchool, num: true },
  { q: 'Закон Ома в какой школе хуже?', c: RU, intent: 'ranking', school: worstOnOhm, num: true },
  { q: 'Что со школой №5?', c: RU, intent: 'unit', school: '№5 мектеп', num: true },
  { q: 'школа 12 слабые темы', c: RU, intent: 'unit', school: '№12 мектеп', num: true },
  { q: 'Как дела у 8Б?', c: RU4, intent: 'unit', school: '№4 мектеп', unit: '8Б', num: true },
  { q: 'Что делать?', c: RU, intent: 'todo', num: true },
  { q: 'С чего начать методисту?', c: RU, intent: 'todo', num: true },
  { q: 'Привет', c: RU, intent: 'smalltalk' },
  { q: 'Спасибо!', c: RU, intent: 'smalltalk' },
  { q: 'Что такое p-значение?', c: RU, intent: 'term' },
  { q: 'Кто выиграет чемпионат мира?', c: RU, intent: 'help' },
  { q: 'если на закон Ома дать 5 часов', c: RU, intent: 'whatif', topic: 't14', num: true, has: ['4 → 5'] },
  { q: 'сколько часов убрать с темы магниты', c: RU, intent: 'whatif', topic: 't17', num: true },
  { q: 'тепловые двигатели кпд почему низко', c: RU, intent: 'topic', topic: 't09', num: true },
  { q: 'Линзы и отражение света — что сложнее?', c: RU, intent: 'compare', names: ['t19', 't20'], num: true },
  { q: 'какой раздел самый сложный', c: RU, intent: 'section', num: true },
  { q: 'какие школы отстают по физике', c: RU, intent: 'ranking', school: worstSchool, num: true },
  { q: 'в 5-й школе как дела', c: RU, intent: 'unit', school: '№5 мектеп', num: true },
  { q: 'школа 4 класс 8А', c: RU, intent: 'unit', school: '№4 мектеп', unit: '8А', num: true },
  { q: 'Школа №99', c: RU, intent: 'unit', has: ['99'] },
  { q: 'напряжение', c: RU, intent: 'topic', names: ['t11', 't13'] },
  { q: 'дайте рекомендации', c: RU, intent: 'todo', num: true },
  { q: 'доброе утро', c: RU, intent: 'smalltalk' },
];

function check(k: Case): string[] {
  const r = answer(k.q, k.c);
  const text = r.text.join('\n');
  const ds = k.c.region;
  const fails: string[] = [];
  const got = r.intent;
  if (got !== k.intent) fails.push(`ниет ${got} ≠ ${k.intent}`);
  if (k.topic && !r.actions.some((a) => a.topic === ti(k.topic!, ds))) fails.push(`тақырып ${k.topic} жоқ`);
  for (const id of k.names ?? []) {
    const t = ds.topics[ti(id, ds)];
    if (!text.includes(t.name[k.c.lang])) fails.push(`«${t.name[k.c.lang]}» аталмаған`);
  }
  if (k.tab && !r.actions.some((a) => a.tab === k.tab)) fails.push(`бет ${k.tab} жоқ`);
  if (k.school && !r.actions.some((a) => a.scope?.school === k.school)) fails.push(`мектеп ${k.school} жоқ`);
  if (k.unit && !r.actions.some((a) => a.scope?.unit === k.unit)) fails.push(`сынып ${k.unit} жоқ`);
  if (k.num && !/\d/.test(text)) fails.push('сан жоқ');
  for (const h of k.has ?? []) if (!text.includes(h)) fails.push(`«${h}» жоқ`);
  if (r.text.length > 7) fails.push(`тым ұзын (${r.text.length} жол)`);
  return fails;
}

describe('ИИ көмекші: бағалау жиынтығы', () => {
  it('жиынтық толық: ≥ 40 сұрақ, жартысы қазақша, жартысы орысша', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    const kk = CASES.filter((k) => k.c.lang === 'kk').length;
    expect(Math.abs(kk - (CASES.length - kk))).toBeLessThanOrEqual(2);
  });

  it('дәлдік ≥ 90%', () => {
    const bad: string[] = [];
    let ok = 0;
    for (const k of CASES) {
      const f = check(k);
      if (f.length) bad.push(`  ✗ [${k.c.lang}] ${k.q} — ${f.join('; ')}`);
      else ok++;
    }
    const acc = (100 * ok) / CASES.length;
    console.log(`\nИИ көмекші, бағалау: ${ok}/${CASES.length} = ${acc.toFixed(1)}%\n${bad.join('\n')}`);
    expect(acc).toBeGreaterThanOrEqual(90);
  });
});
