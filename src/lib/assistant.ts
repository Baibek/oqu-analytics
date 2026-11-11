import type { Dataset, Lang } from './types';
import type { HourModel, TextbookResult, TopicStat } from './analysis';
import { compareTextbooks, MIN_LOCAL, PASS, predictEffect, schoolIndex } from './analysis';
import { mean } from './stats';

// ИИ көмекшінің кірістірілген (офлайн) талдаушысы. Ол сұрақтың мағынасын кілт сөздер
// арқылы анықтап, сайтта есептелген нақты сандармен жауап береді. Ойдан ештеңе қоспайды:
// дерек болмаса, соны айтады. Claude режимі қосылса, осы контекст модельге беріледі.

export type AssistTab = 'overview' | 'topics' | 'textbooks' | 'hours' | 'data';

export interface AssistAction {
  label: string;
  tab?: AssistTab;
  /** Мектепті (және сыныпты) таңдау */
  scope?: { school: string | null; unit: string | null };
  /** Тақырыпты ашу (индекс) */
  topic?: number;
}

/** Сұрақтың анықталған ниеті: бағалау мен баптау үшін */
export type Intent = 'nodata' | 'term' | 'unit' | 'whatif' | 'compare' | 'textbooks' | 'ranking' | 'topic' | 'section' | 'hours' | 'todo' | 'hard' | 'smalltalk' | 'help';

export interface AssistReply {
  intent: Intent;
  text: string[];
  actions: AssistAction[];
}

export interface AssistContext {
  lang: Lang;
  /** Таңдалған аяның дерегі */
  ds: Dataset;
  /** Бүкіл облыс */
  region: Dataset;
  stats: TopicStat[];
  regionStats: TopicStat[];
  textbooks: TextbookResult | null;
  model: HourModel;
  recommended: number[];
  scopeLabel: string | null;
}

const f = (x: number | null | undefined, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(d).replace('.', ',').replace('-', '−'));
const sg = (x: number | null | undefined, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? '—' : (x > 0 ? '+' : '') + f(x, d));

// ================= Мәтінді қалыпқа келтіру =================

const FOLD: Record<string, string> = { ә: 'а', ө: 'о', ұ: 'у', ү: 'у', қ: 'к', ғ: 'г', ң: 'н', і: 'и', һ: 'х', ё: 'е' };

/**
 * Қазақ әріптерін орыс әріптеріне «бүктеу»: көп адам қазақ пернетақтасынсыз жазады
 * («киын такырып»), сондықтан кілт сөздер мен атаулар бүктелген түрде салыстырылады.
 */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[әөұүқғңіһё]/g, (ch) => FOLD[ch])
    .replace(/(?<=[а-я])i|i(?=[а-я])/g, 'и')
    .replace(/[«»"“”.,!?;:()…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (s: string) => fold(s).split(/[\s–—/]+|-(?=[а-я])/).filter((w) => w && !/^\d+$/.test(w));

function lev(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Сұрақтағы сөз (a) атаудағы сөзге (b) сәйкес пе: 1 — түбірі бірдей (жалғау ғана басқа),
 * 0,8 — бір-екі әріп қате терілген, 0 — сәйкес емес.
 */
export function wordMatch(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length <= 3 || b.length <= 3) {
    // «Ом», «ток», «ПӘК»: қысқа терминге тек жалғау жалғануы мүмкін
    return b.length >= 2 && a.startsWith(b) && a.length - b.length <= (b.length === 2 ? 4 : 3) ? 0.9 : 0;
  }
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  if (p >= 4 && p >= Math.min(a.length, b.length) - 2 && Math.abs(a.length - b.length) <= 6) return 1;
  if (a[0] !== b[0]) return 0;
  const tol = b.length >= 7 ? 2 : 1;
  if (b.length <= 5) return lev(a, b) <= 1 ? 0.8 : 0;
  for (let k = b.length - 1; k <= Math.min(a.length, b.length + 1); k++) if (lev(a.slice(0, k), b) <= tol) return 0.8;
  for (let k = Math.max(b.length - 3, a.length - 1); k <= Math.min(b.length, a.length + 1); k++) if (lev(a, b.slice(0, k)) <= tol) return 0.8;
  return 0;
}

// Сұрақтағы «қызметтік» сөздер: тақырып атауына жатпайды
const Q_EXACT = new Set(['тема', 'темы', 'теме', 'тему', 'темой', 'тем', 'час', 'часа', 'часов', 'часы', 'ч', 'кай', 'кайсы', 'неге', 'не', 'мен', 'пен', 'бен', 'и', 'или', 'по', 'про', 'на', 'в', 'с', 'у', 'о', 'об', 'для', 'ли', 'ма', 'ме', 'ба', 'бе', 'па', 'пе', 'косу', 'коса', 'коссак', 'косса', 'косып', 'как', 'что', 'это', 'жане', 'ушин', 'туралы', 'бар', 'жок', 'ен', 'самый', 'самая', 'самые', 'все', 'всего', 'закон', 'заны', 'занын', 'занына', 'закона', 'закону', 'законы', 'занды']);
const Q_PREFIX = ['такыры', 'калай', 'кандай', 'почему', 'сколько', 'какой', 'какая', 'какие', 'каких', 'киын', 'сложн', 'трудн', 'нашар', 'алсиз', 'слаб', 'мектеп', 'школ', 'сыны', 'класс', 'окулык', 'учебн', 'сагат', 'керек', 'нужн', 'надо', 'добав', 'убра', 'азайт', 'болад', 'будет', 'балл', 'натиже', 'результ', 'менгер', 'усво', 'салыстыр', 'сравн', 'болим', 'раздел', 'бойынш', 'жаксы', 'лучш', 'хуже', 'плох', 'если', 'егер', 'неліктен', 'неликтен', 'озгер', 'изменен', 'изменит', 'жаксарт', 'улучш'];

const qWords = (q: string) => words(q).filter((w) => !Q_EXACT.has(w) && !Q_PREFIX.some((p) => w.startsWith(p)));

// Атаудағы мағынасыз сөздер: «Ом заңы» мен «Кулон заңы» тек «заң» арқылы сәйкеспеуі үшін «заң» ескерілмейді
const T_STOP = new Set(['ушин', 'жане', 'и', 'для', 'при', 'мен', 'пен', 'бен', 'онын', 'ее', 'его', 'на', 'над', 'ними', 'негиздери', 'основы', 'заны', 'закон', 'закона', 'законы', 'занын', 'занынын']);

interface Named {
  /** Атау нұсқалары (қазақша, орысша), бүктелген сөздер */
  variants: string[][];
  /** Тек осы атауда кездесетін сөздер (мысалы, «Кулон») — күшті белгі */
  unique: Set<string>;
}

function index(names: { kk: string; ru: string }[]): Named[] {
  const vs = names.map((n) => [n.kk, n.ru].map((s) => words(s).filter((w) => !T_STOP.has(w))));
  return vs.map((v, i) => ({
    variants: v,
    unique: new Set(v.flat().filter((w) => !vs.some((o, j) => j !== i && o.flat().some((x) => wordMatch(x, w) === 1 || wordMatch(w, x) === 1)))),
  }));
}

export interface Hit {
  i: number;
  score: number;
  /** Сұрақтың қай сөздері сәйкес келді */
  used: Set<number>;
}

/** Атаулар тізімінен сұраққа сәйкестерін табу (ұпайы бойынша кему ретімен) */
function matchNames(q: string, items: Named[], min = 0.5): Hit[] {
  const qs = qWords(q);
  if (!qs.length) return [];
  const hits: Hit[] = [];
  items.forEach((it, i) => {
    let best: Hit | null = null;
    for (const ws of it.variants) {
      if (!ws.length) continue;
      let sum = 0;
      let unique = false;
      const used = new Set<number>();
      for (const w of ws) {
        let m = 0;
        let at = -1;
        qs.forEach((qw, k) => {
          const v = wordMatch(qw, w);
          if (v > m) [m, at] = [v, k];
        });
        if (!m) continue;
        sum += m;
        used.add(at);
        if (it.unique.has(w)) unique = true;
      }
      if (!sum) continue;
      const score = sum / Math.max(2, Math.min(ws.length, 4)) + (unique ? 0.25 : 0);
      if (!best || score > best.score) best = { i, score, used };
    }
    if (best && best.score >= min) hits.push(best);
  });
  return hits.sort((a, b) => b.score - a.score);
}

const topicIndex = new WeakMap<object, Named[]>();
const sectionIndex = new WeakMap<object, { names: { kk: string; ru: string }[]; named: Named[] }>();

/** Сұрақта аталған тақырыптар (бірнешеуі болуы мүмкін) */
export function matchTopics(q: string, ds: Dataset, min = 0.5): Hit[] {
  let idx = topicIndex.get(ds.topics);
  if (!idx) topicIndex.set(ds.topics, (idx = index(ds.topics.map((t) => t.name))));
  return matchNames(q, idx, min);
}

/** Сұрақта аталған тақырып (ең сәйкесі) */
export function matchTopic(q: string, ds: Dataset, lang?: Lang): number | null {
  void lang;
  return matchTopics(q, ds)[0]?.i ?? null;
}

function sections(ds: Dataset) {
  let s = sectionIndex.get(ds.topics);
  if (!s) {
    const names = [...new Map(ds.topics.map((t) => [t.section.kk, t.section])).values()];
    sectionIndex.set(ds.topics, (s = { names, named: index(names) }));
  }
  return s;
}

// ================= Мектептер мен сыныптар =================

export interface Ranked {
  school: string;
  unit: string | null;
  mastery: number;
  n: number;
}

/** Мектептер немесе сыныптар рейтингі: барлық тақырып (немесе бір тақырып) бойынша меңгеру үлесі */
export function rankUnits(ds: Dataset, by: 'school' | 'class', topic?: number): Ranked[] {
  const sch = schoolIndex(ds);
  const key = (u: number) => (by === 'school' ? String(sch[u]) : String(u));
  const acc = new Map<string, { pass: number; cnt: number; students: Set<string>; u: number }>();
  for (const s of ds.students) {
    const k = key(s.unit);
    let a = acc.get(k);
    if (!a) acc.set(k, (a = { pass: 0, cnt: 0, students: new Set(), u: s.unit }));
    const vs = topic === undefined ? s.scores : [s.scores[topic]];
    for (const v of vs) {
      if (Number.isNaN(v)) continue;
      a.students.add(s.id);
      a.cnt++;
      if (v >= PASS) a.pass++;
    }
  }
  return [...acc.values()]
    .filter((a) => a.students.size >= MIN_LOCAL && a.cnt > 0)
    .map((a) => ({ school: ds.units[a.u].school, unit: by === 'class' ? ds.units[a.u].name || null : null, mastery: (100 * a.pass) / a.cnt, n: a.students.size }))
    .sort((x, y) => x.mastery - y.mastery);
}

/** Оқушылар тобының әр тақырып бойынша меңгеру үлесі (сенім аралығынсыз, жылдам) */
function masteryOf(ds: Dataset, keep: (unit: number) => boolean) {
  const nT = ds.topics.length;
  const pass = new Array<number>(nT).fill(0);
  const cnt = new Array<number>(nT).fill(0);
  let students = 0;
  for (const s of ds.students) {
    if (!keep(s.unit)) continue;
    students++;
    s.scores.forEach((v, i) => {
      if (Number.isNaN(v)) return;
      cnt[i]++;
      if (v >= PASS) pass[i]++;
    });
  }
  const tp = pass.reduce((a, b) => a + b, 0);
  const tc = cnt.reduce((a, b) => a + b, 0);
  return { per: cnt.map((c, i) => ({ m: c ? (100 * pass[i]) / c : NaN, n: c })), all: tc ? (100 * tp) / tc : NaN, students };
}

/** Облыспен салыстырғанда ең артта қалған тақырыптар */
function gaps(per: { m: number; n: number }[], regionStats: TopicStat[]) {
  return per
    .map((p, i) => ({ i, m: p.m, reg: regionStats[i].mastery, gap: p.m - regionStats[i].mastery, n: p.n }))
    .filter((g) => g.n >= MIN_LOCAL && regionStats[g.i].status !== 'nodata')
    .sort((a, b) => a.gap - b.gap);
}

const CLASS_LETTERS = 'абвгдеәжзиклмн';

/** Сұрақтағы мектеп нөмірі (№5, 5-мектеп, школа 5) */
function findSchoolNo(lower: string): number | null {
  const fq = fold(lower.replace(/№/g, ' № '));
  const pats = [
    /№\s*(\d{1,4})(?!\d)/,
    /(?<![\d])(\d{1,4})\s*-?\s*(?:(?!сагат|час|балл|сынып|класс|оку)[а-я]{1,5}\s+)?(?:мектеп|школ|сш|гимназ|лицей)/,
    /(?:мектеп|школ|сш|гимназ|лицей)[а-я]*\s+(?:номер\s*|н\s*)?(\d{1,4})(?!\s*(?:сагат|час|ч(?![а-я])|%|балл|оку))/,
  ];
  for (const re of pats) {
    const m = fq.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Сұрақтағы сынып атауы (8Ә, 8 «Б», 9-А) */
function findClass(lower: string): { grade: number; name: string } | null {
  const re = new RegExp(`(?<![\\p{L}\\d№])(\\d{1,2})\\s?[-«"]?\\s?([${CLASS_LETTERS}])(?![\\p{L}])`, 'u');
  const m = lower.match(re);
  if (!m) return null;
  const grade = Number(m[1]);
  if (grade < 1 || grade > 11) return null;
  return { grade, name: `${grade}${m[2].toUpperCase()}` };
}

// ================= Ниет белгілері (бүктелген мәтінге) =================

const RE = {
  greet: /^(сал[еа]м|салеметсиз|салемет|привет|здравств|здрасьт|добр[а-я]* (день|утро|вечер)|кайырлы|hello|hi)(?![а-яa-z])/,
  thanks: /рахмет|ракмет|спасиб|благодар|thank|керемет|отлично|супер/,
  meta: /не истей аласын|не иство|что ты умеешь|что умеешь|кто ты|сен кимсин|кимсин|что можешь/,
  termCi: /сеним аралы|довер|(?<![а-яa-z])(си|ди)(?![а-яa-z])|confidence/,
  termP: /p-м|p-зн|p ман|p знач|p-value|(?<![а-я])p(?![a-z])/,
  termSd: /(?<![a-z])sd(?![a-z])|стандарт[а-я]* (ауыт|отклон)/,
  define: /деген не|дегенимиз|деген немене|не деген|что такое|что значит|что означает|объясни|тусиндир/,
  hours: /сагат|(?<![а-я])час|уакыт|время|распредел|болу(ге|ди)?(?![а-я])|болген|(?<![а-я])ч(?![а-я])/,
  whatif: /коссак|косса|коскан|косып|косылс|косай|косым|добав|увелич|прибав|азайт|алып таст|алсак|кыскарт|сократ|убра|убав|уменьш|что будет|не болады|не озгер|если|егер|(?<![а-я])дать|выдел|отвест|болса|болсын|бер(се|сек|ип)(?![а-я])/,
  absolute: /(?<![а-я])дать|выдел|отвест|(?<![а-я])до \d|болса|болсын|бер(се|сек|ип)(?![а-я])|етсек|сделать/,
  add: /коссак|косса|коскан|косып|косылс|косай|косым|добав|увелич|прибав|еще|тагы|азайт|алып|алсак|кыскарт|сократ|убра|убав|уменьш/,
  minus: /азайт|алып|алсак|кыскарт|сократ|убра|убав|уменьш|меньше|кем(ит|ит)/,
  book: /окулык|учебн|китап|книг/,
  why: /неге|себеп|почему|причин|неликтен/,
  school: /мектеп|школ|сынып|класс|сш(?![а-я])/,
  weak: /алсиз|нашар|томен|слаб|худш|хуже|отста|рейтинг|низк|артта|проблем|плох/,
  strong: /лучш|жаксы|мыкты|уздик|сильн|высок|жогары|алдынгы/,
  which: /кай мектеп|кай сынып|в как[а-я]* (школ|класс)|как[а-я]* (школ|класс)|где /,
  compare: /салыстыр|сравн|(?<![а-я])или(?![а-я])|алде|(?<![a-z])vs(?![a-z])|кайсысы|котор|разниц|айырма/,
  section: /болим|раздел|блок|модул/,
  todo: /не\s+усына|не\s+истеу|не\s+истейм|не\s+исте(ген|у) керек|что\s+(нам\s+|мне\s+)?делать|с чего нача|кайдан баста|что посовет|что предпринять|усынысын|усыныстар|рекомендац|совет|план действ|приорит|басымдык|как улучшить|калай жаксарт|жаксарту ушин|кандай шара|какие меры/,
  hard: /киын|алсиз|нашар|сложн|слаб|проблем|менгер|усво|такырып|(?<![а-я])тем[аыуе]?(?![а-я])|корытынд|вывод|негизги|главн|хуже|плох|отста|обзор|шолу|жалпы|итог/,
};

const has = (q: string, re: RegExp) => re.test(q);

const NUMWORDS: [RegExp, number][] = [
  [/(?<![а-я])(бир|один|одн[уа]?)(?![а-я])/, 1],
  [/(?<![а-я])(еки|два|две|пару)(?![а-я])/, 2],
  [/(?<![а-я])(уш|три)(?![а-я])/, 3],
  [/(?<![а-я])(торт|четыре)(?![а-я])/, 4],
  [/(?<![а-я])(бес|пять)(?![а-я])/, 5],
];

function hoursDelta(fq: string): number | null {
  const m = fq.match(/(\d{1,2})\s*(?:-?\s*)?(?:сагат|час|ч(?![а-я]))/) ?? fq.match(/(?:сагат|час)[а-я]*\s*(\d{1,2})(?!\d)/);
  let n: number | null = m ? Number(m[1]) : null;
  if (n === null) for (const [re, v] of NUMWORDS) if (re.test(fq)) n = v;
  if (n === null && has(fq, RE.whatif)) n = 1;
  if (n === null) return null;
  return has(fq, RE.minus) ? -n : n;
}

/** «6 сағат болса», «дать 6 часов» — жаңа сағат саны (өсім емес) */
const absoluteHours = (fq: string) => has(fq, RE.absolute) && !has(fq, RE.add);

// ================= Жауап =================

export function answer(question: string, c: AssistContext): AssistReply {
  const { lang, ds, stats, model } = c;
  const t = (kk: string, ru: string) => (lang === 'kk' ? kk : ru);
  const q = fold(question);
  const lower = question.toLowerCase();
  const name = (i: number) => ds.topics[i].name[lang];
  const usable = stats.filter((s) => s.status !== 'nodata');
  const where = c.scopeLabel ?? t('облыс бойынша', 'по области');
  const reply = (intent: Intent, text: string[], actions: AssistAction[] = []): AssistReply => ({ intent, text: text.filter(Boolean), actions });

  if (!usable.length) {
    return reply('nodata', [t('Таңдалған ая бойынша қорытынды жасауға дерек жеткіліксіз. Мектепті немесе сүзгіні өзгертіп көріңіз.', 'Для выбранной выборки данных недостаточно. Попробуйте другую школу или снимите фильтр.')], [{ label: t('Дерек жүктеу', 'Загрузить данные'), tab: 'data' }]);
  }

  const isHours = has(q, RE.hours);
  const isBook = has(q, RE.book);
  const isWhy = has(q, RE.why);
  const topics = matchTopics(question, ds);
  const topic = topics[0]?.i ?? null;
  const secHits = matchNames(question, sections(ds).named);
  const secName = secHits[0] ? sections(ds).names[secHits[0].i] : null;
  const preferSection = secName !== null && (has(q, RE.section) || !topics.length || secHits[0].score > topics[0].score);

  // 1. Терминдер
  const termOnly = has(q, RE.define) || (!topics.length && !isBook && !isHours);
  if (termOnly && has(q, RE.termCi)) {
    return reply('term', [
      t(
        '95% сенім аралығы — нақты мәннің 95% ықтималдықпен жататын аралығы. Мысалы, «35% (29–41)» дегеніміз: меңгеру үлесі шамамен 29–41% аралығында. Дерек аз болса, аралық кеңейеді.',
        '95% доверительный интервал — диапазон, где истинное значение лежит с вероятностью 95%. Например, «35% (29–41)»: доля усвоивших примерно от 29 до 41%. Чем меньше данных, тем он шире.',
      ),
      t('Облыс бойынша аралық мектептерді қайта іріктеу арқылы есептеледі, себебі бір мектептің оқушылары тәуелсіз емес.', 'По области интервал считается перевыборкой школ, так как ученики одной школы не независимы.'),
    ]);
  }
  if (termOnly && has(q, RE.termP)) {
    return reply('term', [
      t(
        'p-мән — айырмашылық шын мәнінде жоқ болса, мұндай нәтиженің кездейсоқ шығу ықтималдығы. p < 0,05 болса, айырма «мәнді» деп саналады. Біз айырма мәнді болмаса, оны ашық «дәлелденбеген» деп жазамыз.',
        'p-значение — вероятность получить такой результат случайно, если разницы на самом деле нет. При p < 0,05 разница считается «значимой». Если разница незначима, мы прямо пишем «не доказана».',
      ),
    ]);
  }
  if (termOnly && has(q, RE.termSd)) {
    return reply('term', [
      t(
        'SD — оқушылар арасындағы әдеттегі айырма. Оқулық әсерін SD бірлігінде көрсетеміз: 0,1 SD — шағын, 0,3 SD — байқалатын әсер. Халықаралық зерттеулерде оқулықтар айырмасы әдетте 0,03–0,08 SD.',
        'SD — обычный разброс между учениками. Эффект учебника показываем в SD: 0,1 SD — малый, 0,3 SD — заметный. В международных исследованиях разница учебников обычно 0,03–0,08 SD.',
      ),
    ]);
  }

  // 2. Нақты мектеп немесе сынып
  const schoolNo = findSchoolNo(lower);
  const cls = findClass(lower);
  if (schoolNo !== null || cls) return unitAnswer(c, schoolNo, cls, topic);
  if (c.scopeLabel && topic === null && !isBook && !isHours && has(q, /облыс|област|регион|салыстыр|сравн|ерекше|особен|артта|отста/)) return unitAnswer(c, null, null, null);

  // 3. «Сағат қоссақ не болады?» және тақырыптың сағаты
  const delta = hoursDelta(q);
  if (isHours && has(q, RE.whatif) && topic === null && !preferSection) return whatIfGeneral(c);
  if (isHours && topic !== null && !isBook && !(preferSection && has(q, RE.section))) {
    const d = has(q, RE.whatif) ? delta : null;
    return whatIf(c, topic, d !== null && d > 0 && absoluteHours(q) ? d - c.model.topics[topic].planned : d);
  }

  // 4. Екі тақырыпты салыстыру
  if (topics.length >= 2 && !isBook && !(preferSection && has(q, RE.section))) {
    const [a, b] = topics;
    const disjoint = [...b.used].some((k) => !a.used.has(k));
    if (disjoint && (has(q, RE.compare) || b.score >= 0.5)) return compareTopics(c, a.i, b.i);
  }

  // 5. Оқулықтар (бүкіл курс, бөлім немесе тақырып бойынша)
  if (isBook) {
    const idx = preferSection && has(q, RE.section) && secName ? ds.topics.map((tp, i) => (tp.section.kk === secName.kk ? i : -1)).filter((i) => i >= 0) : topic !== null ? [topic] : secName && preferSection ? ds.topics.map((tp, i) => (tp.section.kk === secName.kk ? i : -1)).filter((i) => i >= 0) : null;
    const label = idx ? (idx.length === 1 ? `«${name(idx[0])}»` : `«${secName![lang]}» ${t('бөлімі', 'раздел')}`) : null;
    return textbooksAnswer(c, idx, label);
  }

  // 6. Тақырып бойынша мектептер рейтингі («Ом заңы қай мектепте нашар?»)
  const isRank = has(q, RE.school) && (has(q, RE.weak) || has(q, RE.strong) || has(q, RE.which));
  if (topic !== null && isRank && !preferSection) return rankingAnswer(c, q, topic);

  // 7. Бөлім
  if (secName && preferSection) return sectionAnswer(c, secName);
  if (!secName && has(q, RE.section) && !isHours) return sectionsRanking(c);

  // 8. Нақты тақырып
  if (topic !== null) {
    const s = stats[topic];
    const h = model.topics[topic];
    const reg = c.regionStats[topic];
    const rec = c.recommended[topic];
    const tp = ds.topics[topic];
    const lines: string[] = [];
    if (s.status === 'nodata') {
      lines.push(t(`«${name(topic)}» бойынша дерек жеткіліксіз (${s.n} оқушы).`, `По теме «${name(topic)}» данных недостаточно (${s.n} учеников).`));
    } else {
      const st = { hard: t('қиын', 'сложная'), watch: t('назарда', 'в зоне риска'), ok: t('қалыпты', 'в норме'), nodata: '' }[s.status];
      lines.push(
        t(
          `«${name(topic)}» (${where}): оқушылардың ${f(s.mastery)}%-ы меңгерген (95% СА ${f(s.lo)}–${f(s.hi)}), ${s.n} оқушы. Мәртебесі: ${st}.`,
          `«${name(topic)}» (${where}): усвоили ${f(s.mastery)}% учеников (95% ДИ ${f(s.lo)}–${f(s.hi)}), ${s.n} учеников. Статус: ${st}.`,
        ),
      );
      if (c.scopeLabel && reg.status !== 'nodata') lines.push(t(`Облыс бойынша — ${f(reg.mastery)}% (айырма ${sg(s.mastery - reg.mastery, 0)} п.п.).`, `По области — ${f(reg.mastery)}% (разница ${sg(s.mastery - reg.mastery, 0)} п.п.).`));
      if (s.prereq) {
        lines.push(
          s.prereq.root
            ? t(
                `Ықтимал себебі тірек тақырыпта: «${name(s.prereq.i)}» тек ${f(s.prereq.mastery)}% меңгерілген, ал нәтижелер байланысы r = ${f(s.prereq.r, 2)}. Алдымен соны күшейткен жөн.`,
                `Вероятная причина в опорной теме: «${name(s.prereq.i)}» усвоена лишь на ${f(s.prereq.mastery)}%, связь результатов r = ${f(s.prereq.r, 2)}. Сначала стоит усилить её.`,
              )
            : stats[s.prereq.i].status === 'ok'
              ? t(`Тірек тақырып «${name(s.prereq.i)}» жақсы меңгерілген (${f(s.prereq.mastery)}%), себеп басқа жерде болуы мүмкін.`, `Опорная тема «${name(s.prereq.i)}» усвоена хорошо (${f(s.prereq.mastery)}%), причина, вероятно, в другом.`)
              : t(`Тірек тақырып «${name(s.prereq.i)}» — ${f(s.prereq.mastery)}% (байланыс r = ${f(s.prereq.r, 2)}); оны да назарда ұстаған жөн.`, `Опорная тема «${name(s.prereq.i)}» — ${f(s.prereq.mastery)}% (связь r = ${f(s.prereq.r, 2)}); за ней тоже стоит следить.`),
        );
      } else if (isWhy) {
        lines.push(t('Бұл тақырыптың тірек тақырыбы көрсетілмеген, сондықтан себепті деректен анықтау мүмкін емес.', 'Опорная тема не указана, поэтому причину по данным определить нельзя.'));
      }
      lines.push(
        h.evidence === 'none'
          ? t('Сағаты көп сыныптарда нәтиже жоғары екені байқалмайды: қосымша сағаттың пайдасы дәлелденбеген.', 'В классах с большим числом часов результат не выше: польза дополнительных часов не подтверждена.')
          : t(`+1 сағат ≈ ${sg(h.perHour)} балл. Жоспарда ${tp.planned} сағат, ұсыныс — ${rec} сағат.`, `+1 час ≈ ${sg(h.perHour)} балла. По плану ${tp.planned} ч, рекомендация — ${rec} ч.`),
      );
    }
    return reply('topic', lines, [{ label: t('Тақырыпты ашу', 'Открыть тему'), tab: 'topics', topic }]);
  }

  // 8а. Бір сөз бірнеше тақырыпқа сәйкес («напряжение»): нақтылауды сұраймыз
  const loose = qWords(question).length <= 3 ? matchTopics(question, ds, 0.25) : [];
  if (loose.length >= 2 && loose.length <= 4 && !isHours && !isBook) {
    return reply(
      'topic',
      [
        t('Бұл сөз бірнеше тақырыпта кездеседі — қайсысы туралы сұрадыңыз?', 'Это слово встречается в нескольких темах — о какой речь?'),
        ...loose.map((h) => `• «${name(h.i)}» — ${stats[h.i].status === 'nodata' ? t('дерек аз', 'мало данных') : `${f(stats[h.i].mastery)}%`}`),
      ],
      loose.map((h) => ({ label: name(h.i), tab: 'topics' as AssistTab, topic: h.i })),
    );
  }

  // 9. Сағаттар
  if (isHours) return hoursAnswer(c);

  // 10. Мектептер мен сыныптар рейтингі
  if (isRank) return rankingAnswer(c, q, null);

  // 11. «Не істеу керек?»
  if (has(q, RE.meta)) return helpAnswer(c, false);
  if (has(q, RE.todo)) return todoAnswer(c);

  // 12. Қиын тақырыптар
  if (has(q, RE.hard)) {
    const hard = usable.filter((s) => s.status === 'hard').sort((a, b) => a.mastery - b.mastery);
    const watch = usable.filter((s) => s.status === 'watch').sort((a, b) => a.mastery - b.mastery);
    const list = (hard.length ? hard : watch).slice(0, 4);
    return reply(
      'hard',
      [
        hard.length
          ? t(`${where}: ${hard.length} тақырып қиын (меңгеру үлесі 50%-дан төмен), тағы ${watch.length} тақырып назарда.`, `${where}: сложных тем — ${hard.length} (доля усвоивших ниже 50%), ещё ${watch.length} в зоне риска.`)
          : t(`${where}: қиын тақырып жоқ, ${watch.length} тақырып назарда.`, `${where}: сложных тем нет, ${watch.length} в зоне риска.`),
        ...list.map((s) => `• «${name(s.i)}» — ${f(s.mastery)}% (${f(s.lo)}–${f(s.hi)})${s.prereq?.root ? t(`; себебі тірек тақырыпта болуы мүмкін: «${name(s.prereq.i)}»`, `; возможная причина в опорной теме «${name(s.prereq.i)}»`) : ''}`),
      ],
      [{ label: t('Тақырыптарды ашу', 'Открыть темы'), tab: 'topics', topic: list[0]?.i }],
    );
  }

  // 13. Сәлемдесу, алғыс
  if (has(q, RE.greet) || has(q, RE.thanks)) {
    const thanks = has(q, RE.thanks) && !has(q, RE.greet);
    return reply('smalltalk', [
      thanks
        ? t('Оқасы жоқ! Тағы сұрағыңыз болса, жазыңыз.', 'Пожалуйста! Если появятся вопросы — пишите.')
        : t('Сәлеметсіз бе! Мен осы беттегі деректер бойынша жауап беремін.', 'Здравствуйте! Я отвечаю по данным этой страницы.'),
      t('Мысалы: «Ең қиын тақырыптар қандай?», «Не істеу керек?», «№5 мектеп қалай?»', 'Например: «Какие темы самые сложные?», «Что делать?», «Как дела в школе №5?»'),
    ]);
  }
  return helpAnswer(c, true);
}

// ---------------- Жеке жауаптар ----------------

function tr(c: AssistContext) {
  return (kk: string, ru: string) => (c.lang === 'kk' ? kk : ru);
}

function helpAnswer(c: AssistContext, outOfScope: boolean): AssistReply {
  const t = tr(c);
  return {
    intent: 'help',
    text: [
      outOfScope ? t('Бұл сұраққа сайттағы деректерден жауап таба алмадым — ойдан жауап бермеймін.', 'На этот вопрос в данных сайта ответа нет — придумывать не буду.') : '',
      t(
        'Мен сайтта есептелген деректер бойынша жауап беремін: қиын тақырыптар мен себебі, бөлімдер, екі тақырыпты салыстыру, оқулықтар, сағатты бөлу және «2 сағат қоссақ не болады?», нақты мектеп не сынып («№5 мектеп», «8Ә»), «не істеу керек?», терминдер (сенім аралығы, p-мән, SD).',
        'Я отвечаю по данным, рассчитанным на сайте: сложные темы и их причины, разделы, сравнение двух тем, учебники, распределение часов и «что будет, если добавить 2 часа?», конкретная школа или класс («школа №5», «8Б»), «что делать?», термины (доверительный интервал, p-значение, SD).',
      ),
    ].filter(Boolean),
    actions: [],
  };
}

function unitAnswer(c: AssistContext, schoolNo: number | null, clsIn: { grade: number; name: string } | null, topic: number | null): AssistReply {
  const t = tr(c);
  const { region, lang } = c;
  let cls = clsIn;
  const name = (i: number) => region.topics[i].name[lang];
  const schools = [...new Set(region.units.map((u) => u.school))];
  const present = new Set(region.students.map((s) => region.units[s.unit].school));
  // Ағымдағы таңдау: бір мектеп таңдалса, «8Ә» сол мектептің сыныбы деп түсініледі
  const scoped = c.scopeLabel ? [...new Set(c.ds.students.map((s) => c.ds.units[s.unit].school))] : [];
  let school: string | null = null;
  if (schoolNo !== null) {
    school = schools.find((s) => s.match(/\d+/)?.[0] === String(schoolNo)) ?? null;
    if (!school || !present.has(school)) {
      return {
        intent: 'unit',
        text: [t(`№${schoolNo} мектеп бойынша деректе нәтиже жоқ (облыста ${present.size} мектептің дерегі бар; сүзгі қосулы болса, ол алынып тасталған болуы мүмкін).`, `По школе №${schoolNo} в данных нет результатов (в области есть данные ${present.size} школ; если включён фильтр, школа могла быть исключена).`)],
        actions: [{ label: t('Мектептер рейтингі', 'Рейтинг школ'), tab: 'overview' }],
      };
    }
  } else if (scoped.length === 1) school = scoped[0];
  if (!cls && schoolNo === null && school) {
    // Таңдалған бір сынып: «облыспен салыстыр» сол сынып туралы
    const us = [...new Set(c.ds.students.map((s) => s.unit))];
    const u = us.length === 1 ? region.units[us[0]] : null;
    if (u?.name && /^\d+/.test(u.name)) cls = { grade: Number(u.name.match(/^\d+/)![0]), name: u.name };
  }

  if (cls && region.grade && cls.grade !== region.grade) {
    return {
      intent: 'unit',
      text: [
        t(
          `Қазір ${region.grade}-сынып курсы ашық, ал ${cls.name} — басқа параллель. ${cls.name} сыныбын көру үшін жоғарғы мәзірден ${cls.grade}-сынып курсын таңдаңыз.`,
          `Сейчас открыт курс ${region.grade} класса, а ${cls.name} — другая параллель. Чтобы посмотреть ${cls.name}, выберите курс ${cls.grade} класса в верхнем меню.`,
        ),
      ],
      actions: [],
    };
  }

  const label = (r: { school: string; unit: string | null }) => (r.unit ? `${r.school}, ${r.unit}` : r.school);

  // Мектеп белгісіз, тек сынып: облыстағы барлық осындай сыныптар
  if (!school && cls) {
    const all = rankUnits(region, 'class').filter((r) => r.unit?.toLowerCase() === cls.name.toLowerCase());
    if (!all.length) return { intent: 'unit', text: [t(`${cls.name} сыныбы бойынша деректе жеткілікті нәтиже жоқ.`, `По классу ${cls.name} в данных недостаточно результатов.`)], actions: [] };
    const weak = all.slice(0, 3);
    return {
      intent: 'unit',
      text: [
        t(`${cls.name} сыныбы облыста ${all.length} мектепте бар. Нақты мектепті жазыңыз (мысалы, «№5 мектеп ${cls.name}») немесе мектепті таңдаңыз.`, `Класс ${cls.name} есть в ${all.length} школах области. Уточните школу (например, «школа №5 ${cls.name}») или выберите её.`),
        t('Меңгеру үлесі ең төмен:', 'Самая низкая доля усвоивших:') + ' ' + weak.map((r) => `${r.school} — ${f(r.mastery)}%`).join('; ') + '.',
        all.length > 3 ? t(`Ең жоғары: ${all[all.length - 1].school} — ${f(all[all.length - 1].mastery)}%. Облыс орташасы — ${f(mean(c.regionStats.filter((s) => s.status !== 'nodata').map((s) => s.mastery)))}%.`, `Самая высокая: ${all[all.length - 1].school} — ${f(all[all.length - 1].mastery)}%. Среднее по области — ${f(mean(c.regionStats.filter((s) => s.status !== 'nodata').map((s) => s.mastery)))}%.`) : '',
      ].filter(Boolean),
      actions: weak.map((r) => ({ label: label(r), tab: 'overview' as AssistTab, scope: { school: r.school, unit: r.unit } })),
    };
  }
  if (!school) return helpAnswer(c, true);

  const units = region.units.map((u, i) => ({ u, i })).filter(({ u }) => u.school === school);
  let unitIdx: number | null = null;
  if (cls) {
    const hit = units.find(({ u }) => u.name.toLowerCase() === cls.name.toLowerCase()) ?? units.find(({ u }) => fold(u.name) === fold(cls.name));
    if (!hit) {
      return {
        intent: 'unit',
        text: [t(`${school} мектебінде ${cls.name} сыныбы деректе жоқ. Бар сыныптар: ${units.map(({ u }) => u.name).join(', ') || '—'}.`, `В школе ${school} класса ${cls.name} в данных нет. Есть классы: ${units.map(({ u }) => u.name).join(', ') || '—'}.`)],
        actions: [{ label: school, tab: 'overview', scope: { school, unit: null } }],
      };
    }
    unitIdx = hit.i;
  }
  const keep = unitIdx !== null ? (u: number) => u === unitIdx : (u: number) => region.units[u].school === school;
  const mo = masteryOf(region, keep);
  const who = unitIdx !== null ? `${school}, ${region.units[unitIdx].name}` : school;
  const unitName = unitIdx !== null ? region.units[unitIdx].name : null;
  const actions: AssistAction[] = [{ label: t(`${who} — ашу`, `Открыть: ${who}`), tab: 'overview', scope: { school, unit: unitName } }];
  if (mo.students < MIN_LOCAL) {
    return { intent: 'unit', text: [t(`${who}: тек ${mo.students} оқушының нәтижесі бар — қорытынды жасауға аз (кемінде ${MIN_LOCAL} керек).`, `${who}: результаты только ${mo.students} учеников — для выводов мало (нужно не меньше ${MIN_LOCAL}).`)], actions };
  }
  const ranked = rankUnits(region, unitIdx !== null ? 'class' : 'school');
  const pos = ranked.findIndex((r) => r.school === school && (unitIdx === null || r.unit === unitName));
  const books = [...new Set(units.filter(({ i }) => unitIdx === null || i === unitIdx).map(({ u }) => u.textbook))].join(', ');
  const g = gaps(mo.per, c.regionStats);
  const lines: string[] = [
    t(
      `${who}: ${mo.students} оқушы, ${books}. Барлық тақырып бойынша меңгеру үлесі ${f(mo.all)}%${pos >= 0 ? ` — ${ranked.length} ${unitIdx !== null ? 'сыныптың' : 'мектептің'} ішінде төменнен ${pos + 1}-орын` : ''}.`,
      `${who}: ${mo.students} учеников, ${books}. Доля усвоивших по всем темам ${f(mo.all)}%${pos >= 0 ? ` — ${pos + 1}-е место снизу из ${ranked.length} ${unitIdx !== null ? 'классов' : 'школ'}` : ''}.`,
    ),
  ];
  if (topic !== null) {
    const p = mo.per[topic];
    lines.push(
      p.n >= MIN_LOCAL
        ? t(`«${name(topic)}»: ${f(p.m)}% (облыс ${f(c.regionStats[topic].mastery)}%, айырма ${sg(p.m - c.regionStats[topic].mastery, 0)} п.п.), ${p.n} оқушы.`, `«${name(topic)}»: ${f(p.m)}% (область ${f(c.regionStats[topic].mastery)}%, разница ${sg(p.m - c.regionStats[topic].mastery, 0)} п.п.), ${p.n} учеников.`)
        : t(`«${name(topic)}» бойынша дерек аз (${p.n} оқушы).`, `По теме «${name(topic)}» мало данных (${p.n} учеников).`),
    );
  }
  const behind = g.filter((x) => x.gap < 0).slice(0, 3);
  lines.push(
    behind.length
      ? t('Облыстан ең көп артта қалған тақырыптар:', 'Сильнее всего отстают от области:') + ' ' + behind.map((x) => `«${name(x.i)}» ${f(x.m)}% (${t('облыс', 'обл.')} ${f(x.reg)}%, ${sg(x.gap, 0)} п.п.)`).join('; ') + '.'
      : t('Барлық тақырып облыс деңгейінде немесе одан жоғары.', 'Все темы на уровне области или выше.'),
  );
  const ahead = g.filter((x) => x.gap > 0);
  if (ahead.length) lines.push(t(`Ең күшті жағы: «${name(ahead[ahead.length - 1].i)}» (${sg(ahead[ahead.length - 1].gap, 0)} п.п.).`, `Сильная сторона: «${name(ahead[ahead.length - 1].i)}» (${sg(ahead[ahead.length - 1].gap, 0)} п.п.).`));
  // Бір тақырыптағы үлестің кездейсоқ ауытқу шегі (95%, p = 0,5 үшін): бұдан кіші айырмаға сенуге болмайды
  const noise = Math.ceil(196 * Math.sqrt(0.25 / mo.students));
  lines.push(t(`${mo.students} оқушы — шағын топ: ±${noise} п.п.-тен кіші айырма кездейсоқ болуы мүмкін.`, `${mo.students} учеников — небольшая группа: разница меньше ±${noise} п.п. может быть случайной.`));
  if (behind[0]) actions.push({ label: t('Әлсіз тақырыпты ашу', 'Открыть слабую тему'), tab: 'topics', topic: behind[0].i });
  return { intent: 'unit', text: lines, actions };
}

function whatIfGeneral(c: AssistContext): AssistReply {
  const t = tr(c);
  const name = (i: number) => c.ds.topics[i].name[c.lang];
  const ev = c.model.topics.filter((h) => h.evidence !== 'none').sort((a, b) => b.perHour - a.perHour);
  const none = c.model.topics.filter((h) => h.evidence === 'none').length;
  if (!ev.length) {
    return { intent: 'whatif', text: [t('Деректе сағаты көп сыныптардың нәтижесі жоғары екені ешбір тақырыпта дәлелденбеген: қосымша сағаттың әсерін болжауға негіз жоқ.', 'Ни по одной теме данные не подтверждают, что больше часов — выше результат: прогнозировать эффект дополнительных часов не на чем.')], actions: [{ label: t('Сағат жоспары', 'План часов'), tab: 'hours' }] };
  }
  return {
    intent: 'whatif',
    text: [
      t('Қосымша сағат әр тақырыпта әртүрлі әсер етеді. Ең пайдалысы (+1 сағат, орташа балл):', 'Дополнительный час действует по-разному. Больше всего пользы (+1 час, средний балл):'),
      ev.slice(0, 4).map((h) => `«${name(h.i)}» ${sg(h.perHour)}`).join('; ') + '.',
      t(`${none} тақырыпта қосымша сағаттың пайдасы дәлелденбеген. Нақты тақырыпты жазыңыз, мысалы: «${name(ev[0].i)} тақырыбына 2 сағат қоссақ?»`, `По ${none} темам польза дополнительных часов не подтверждена. Назовите тему, например: «если добавить 2 часа на ${name(ev[0].i)}».`),
      t('Болжам тек жоспардан ±30% және деректе бақыланған сағат аралығында жарамды.', 'Прогноз действителен только в пределах ±30% от плана и наблюдаемого в данных диапазона часов.'),
    ],
    actions: [{ label: t('Сағат жоспарын ашу', 'Открыть план часов'), tab: 'hours' }],
  };
}

function whatIf(c: AssistContext, i: number, delta: number | null): AssistReply {
  const t = tr(c);
  const name = c.ds.topics[i].name[c.lang];
  const h = c.model.topics[i];
  const s = c.stats[i];
  const actions: AssistAction[] = [
    { label: t('Тақырыпты ашу', 'Открыть тему'), tab: 'topics', topic: i },
    { label: t('Сағат жоспары', 'План часов'), tab: 'hours' },
  ];
  const range = t(`Модель сенетін аралық: ${h.min}–${h.max} сағат (жоспардан ±30% және деректе бақыланғаны).`, `Модели можно доверять в диапазоне ${h.min}–${h.max} ч (±30% от плана и наблюдаемое в данных).`);
  if (delta === null || delta === 0) {
    return {
      intent: 'whatif',
      text: [
        t(`«${name}»: жоспарда ${h.planned} сағат, ұсыныс — ${c.recommended[i]} сағат.`, `«${name}»: по плану ${h.planned} ч, рекомендация — ${c.recommended[i]} ч.`),
        h.evidence === 'none'
          ? t('Сағаты көп сыныптарда нәтиже жоғары емес: қосымша сағаттың пайдасы дәлелденбеген.', 'В классах с большим числом часов результат не выше: польза дополнительных часов не подтверждена.')
          : t(`+1 сағат ≈ ${sg(h.perHour)} балл (дәлел: ${h.evidence === 'strong' ? 'күшті' : 'әлсіз'}).`, `+1 час ≈ ${sg(h.perHour)} балла (доказательность: ${h.evidence === 'strong' ? 'сильная' : 'слабая'}).`),
        range,
      ],
      actions,
    };
  }
  const target = h.planned + delta;
  const clamped = Math.min(h.max, Math.max(h.min, target));
  const hours = c.model.topics.map((x) => x.planned);
  hours[i] = clamped;
  const eff = predictEffect(c.model, hours).per[i];
  const lines: string[] = [];
  if (h.evidence === 'none') {
    lines.push(t(`«${name}»: ${h.planned} → ${target} сағат. Деректе бұл тақырыптың нәтижесі сағатқа тәуелді екені дәлелденбеген, сондықтан өзгерісті болжауға негіз жоқ (модель ≈ 0 балл деп бағалайды).`, `«${name}»: ${h.planned} → ${target} ч. Зависимость результата этой темы от часов в данных не подтверждена, поэтому предсказать изменение не на чем (модель даёт ≈ 0 баллов).`));
  } else {
    if (clamped !== target) lines.push(t(`${target} сағат — модель сенетін аралықтан тыс (${h.min}–${h.max}). Мұндай сағатпен сабақ өткізген сыныптар деректе жоқ, сондықтан болжамды тек ${clamped} сағатқа дейін береміз.`, `${target} ч — вне диапазона, которому можно доверять (${h.min}–${h.max}). Классов с таким числом часов в данных нет, поэтому прогноз даём только до ${clamped} ч.`));
    lines.push(
      t(
        `«${name}»: ${h.planned} → ${clamped} сағат. Күтілетін өзгеріс: орташа балл ${sg(eff.delta)} ± ${f(eff.half, 1)}${Number.isNaN(s.mean) ? '' : ` (${f(s.mean)} → ${f(s.mean + eff.delta)})`}.`,
        `«${name}»: ${h.planned} → ${clamped} ч. Ожидаемое изменение среднего балла: ${sg(eff.delta)} ± ${f(eff.half, 1)}${Number.isNaN(s.mean) ? '' : ` (${f(s.mean)} → ${f(s.mean + eff.delta)})`}.`,
      ),
    );
    lines.push(t(`Дәлел: ${h.evidence === 'strong' ? 'күшті' : 'әлсіз'}; бұл — сыныптар арасындағы байланыс, кепілдік емес.`, `Доказательность: ${h.evidence === 'strong' ? 'сильная' : 'слабая'}; это связь между классами, а не гарантия.`));
  }
  if (clamped === target || h.evidence === 'none') lines.push(range);
  lines.push(
    delta > 0
      ? t(`Жылдық ${c.model.total} сағат өзгермесе, бұл сағатты басқа тақырыптан алу керек: «Оқу сағаттары» бетінде тексеріңіз.`, `Если годовые ${c.model.total} ч не меняются, эти часы нужно взять из другой темы: проверьте на странице «Учебные часы».`)
      : t(`Босаған сағатты қиын тақырыпқа беруге болады: «Оқу сағаттары» бетінде тексеріңіз.`, `Освободившиеся часы можно отдать сложной теме: проверьте на странице «Учебные часы».`),
  );
  return { intent: 'whatif', text: lines, actions };
}

function compareTopics(c: AssistContext, a: number, b: number): AssistReply {
  const t = tr(c);
  const name = (i: number) => c.ds.topics[i].name[c.lang];
  const [x, y] = [c.stats[a], c.stats[b]];
  if (x.status === 'nodata' || y.status === 'nodata') {
    return { intent: 'compare', text: [t(`«${name(a)}» мен «${name(b)}» тақырыптарын салыстыруға дерек жеткіліксіз.`, `Для сравнения «${name(a)}» и «${name(b)}» данных недостаточно.`)], actions: [] };
  }
  const line = (s: TopicStat) => `«${name(s.i)}» — ${f(s.mastery)}% (95% ${t('СА', 'ДИ')} ${f(s.lo)}–${f(s.hi)}), +1 ${t('сағат', 'ч')} ≈ ${sg(c.model.topics[s.i].perHour)} ${t('балл', 'балла')}`;
  const overlap = x.lo <= y.hi && y.lo <= x.hi;
  const [w, s] = x.mastery <= y.mastery ? [x, y] : [y, x];
  const lines = [
    t(`Салыстыру (${c.scopeLabel ?? 'облыс бойынша'}):`, `Сравнение (${c.scopeLabel ?? 'по области'}):`),
    `• ${line(x)}`,
    `• ${line(y)}`,
    overlap
      ? t(`Айырма ${f(s.mastery - w.mastery)} п.п., бірақ сенім аралықтары қиылысады — бір тақырып екіншісінен қиын екені дәлелденбеген.`, `Разница ${f(s.mastery - w.mastery)} п.п., но интервалы пересекаются — что одна тема сложнее другой, не доказано.`)
      : t(`«${name(w.i)}» айқын қиынырақ: ${f(s.mastery - w.mastery)} п.п. төмен, сенім аралықтары қиылыспайды.`, `«${name(w.i)}» явно сложнее: на ${f(s.mastery - w.mastery)} п.п. ниже, интервалы не пересекаются.`),
  ];
  const link = x.prereq?.i === b ? x : y.prereq?.i === a ? y : null;
  if (link?.prereq) lines.push(t(`«${name(link.prereq.i)}» — «${name(link.i)}» тақырыбының тірегі (r = ${f(link.prereq.r, 2)}).`, `«${name(link.prereq.i)}» — опорная тема для «${name(link.i)}» (r = ${f(link.prereq.r, 2)}).`));
  return { intent: 'compare', text: lines, actions: [{ label: name(w.i), tab: 'topics', topic: w.i }] };
}

function sectionAnswer(c: AssistContext, sec: { kk: string; ru: string }): AssistReply {
  const t = tr(c);
  const name = (i: number) => c.ds.topics[i].name[c.lang];
  const idx = c.ds.topics.map((tp, i) => (tp.section.kk === sec.kk ? i : -1)).filter((i) => i >= 0);
  const ok = idx.map((i) => c.stats[i]).filter((s) => s.status !== 'nodata');
  const title = `«${sec[c.lang]}»`;
  if (!ok.length) return { intent: 'section', text: [t(`${title} бөлімі бойынша дерек жеткіліксіз.`, `По разделу ${title} данных недостаточно.`)], actions: [] };
  const sorted = [...ok].sort((a, b) => a.mastery - b.mastery);
  const avg = mean(ok.map((s) => s.mastery));
  const hard = ok.filter((s) => s.status === 'hard').length;
  const watch = ok.filter((s) => s.status === 'watch').length;
  const planned = idx.reduce((a, i) => a + c.model.topics[i].planned, 0);
  const rec = idx.reduce((a, i) => a + c.recommended[i], 0);
  const lines = [
    t(
      `${title} бөлімі (${c.scopeLabel ?? 'облыс бойынша'}): ${idx.length} тақырып, орташа меңгеру үлесі ${f(avg)}% (${f(sorted[0].mastery)}–${f(sorted[sorted.length - 1].mastery)}%). Қиын — ${hard}, назарда — ${watch}.`,
      `Раздел ${title} (${c.scopeLabel ?? 'по области'}): ${idx.length} тем, средняя доля усвоивших ${f(avg)}% (${f(sorted[0].mastery)}–${f(sorted[sorted.length - 1].mastery)}%). Сложных — ${hard}, в зоне риска — ${watch}.`,
    ),
    t(`Ең әлсізі: «${name(sorted[0].i)}» — ${f(sorted[0].mastery)}%; ең жақсысы: «${name(sorted[sorted.length - 1].i)}» — ${f(sorted[sorted.length - 1].mastery)}%.`, `Слабее всего: «${name(sorted[0].i)}» — ${f(sorted[0].mastery)}%; лучше всего: «${name(sorted[sorted.length - 1].i)}» — ${f(sorted[sorted.length - 1].mastery)}%.`),
  ];
  if (c.scopeLabel) {
    const reg = mean(idx.map((i) => c.regionStats[i]).filter((s) => s.status !== 'nodata').map((s) => s.mastery));
    lines.push(t(`Облыс бойынша бөлім орташасы — ${f(reg)}% (айырма ${sg(avg - reg, 0)} п.п.).`, `По области среднее по разделу — ${f(reg)}% (разница ${sg(avg - reg, 0)} п.п.).`));
  }
  const root = sorted.find((s) => s.prereq?.root);
  if (root?.prereq) lines.push(t(`«${name(root.i)}» тақырыбының ықтимал себебі — тірек «${name(root.prereq.i)}» (${f(root.prereq.mastery)}%).`, `Вероятная причина трудностей «${name(root.i)}» — опорная тема «${name(root.prereq.i)}» (${f(root.prereq.mastery)}%).`));
  lines.push(rec !== planned ? t(`Сағат: жоспарда ${planned}, ұсыныс — ${rec}.`, `Часы: по плану ${planned}, рекомендация — ${rec}.`) : t(`Сағат: жоспарда ${planned}, ұсыныс бойынша өзгеріс жоқ.`, `Часы: по плану ${planned}, по рекомендации без изменений.`));
  return { intent: 'section', text: lines, actions: [{ label: t('Ең әлсіз тақырыпты ашу', 'Открыть самую слабую тему'), tab: 'topics', topic: sorted[0].i }] };
}

function sectionsRanking(c: AssistContext): AssistReply {
  const t = tr(c);
  const rows = sections(c.ds)
    .names.map((sec) => {
      const ok = c.ds.topics.map((tp, i) => (tp.section.kk === sec.kk && c.stats[i].status !== 'nodata' ? i : -1)).filter((i) => i >= 0);
      return { sec, avg: ok.length ? mean(ok.map((i) => c.stats[i].mastery)) : NaN, hard: ok.filter((i) => c.stats[i].status === 'hard').length, worst: ok.sort((a, b) => c.stats[a].mastery - c.stats[b].mastery)[0] };
    })
    .filter((r) => !Number.isNaN(r.avg))
    .sort((a, b) => a.avg - b.avg);
  if (!rows.length) return { intent: 'section', text: [t('Бөлімдер бойынша дерек жеткіліксіз.', 'По разделам данных недостаточно.')], actions: [] };
  return {
    intent: 'section',
    text: [
      t(`Бөлімдер орташа меңгеру үлесі бойынша (${c.scopeLabel ?? 'облыс'}), ең әлсізінен:`, `Разделы по средней доле усвоивших (${c.scopeLabel ?? 'область'}), начиная со слабого:`),
      ...rows.slice(0, 4).map((r, k) => `${k + 1}. «${r.sec[c.lang]}» — ${f(r.avg)}%${r.hard ? t(`, қиын тақырып: ${r.hard}`, `, сложных тем: ${r.hard}`) : ''}`),
    ],
    actions: rows[0].worst !== undefined ? [{ label: t('Ең әлсіз тақырыпты ашу', 'Открыть самую слабую тему'), tab: 'topics', topic: rows[0].worst }] : [],
  };
}

function textbookLines(c: AssistContext, tb: TextbookResult): string[] {
  const t = tr(c);
  const rows = tb.rows.filter((r) => r.verdict !== 'ref');
  const lines = rows.map((r) =>
    r.verdict === 'better' || r.verdict === 'worse'
      ? t(`• ${r.name}: ${sg(r.adj)} балл (95% СА ${sg(r.lo)}…${sg(r.hi)}, ${sg(r.sdUnits, 2)} SD) — мәнді ${r.verdict === 'better' ? 'жоғары' : 'төмен'}.`, `• ${r.name}: ${sg(r.adj)} балла (95% ДИ ${sg(r.lo)}…${sg(r.hi)}, ${sg(r.sdUnits, 2)} SD) — значимо ${r.verdict === 'better' ? 'выше' : 'ниже'}.`)
      : r.verdict === 'unproven'
        ? t(`• ${r.name}: ${sg(r.adj)} балл, бірақ айырма дәлелденбеген (p = ${f(r.p, 2)}).`, `• ${r.name}: ${sg(r.adj)} балла, но разница не доказана (p = ${f(r.p, 2)}).`)
        : t(`• ${r.name}: дерек жеткіліксіз (${r.units} сынып).`, `• ${r.name}: мало данных (${r.units} классов).`),
  );
  const fl = rows.find((r) => r.flipped);
  if (fl) lines.push(t(`Назар аударыңыз: орташа балл бойынша ${fl.name} ${sg(fl.naive)} балл болып көрінеді — бұл мектептер айырмасы, оқулықтікі емес.`, `Внимание: по средним баллам ${fl.name} выглядит как ${sg(fl.naive)} балла — это разница школ, а не учебника.`));
  return lines;
}

function textbooksAnswer(c: AssistContext, idx: number[] | null, label: string | null): AssistReply {
  const t = tr(c);
  const actions: AssistAction[] = [{ label: t('Оқулықтарды салыстыру', 'Сравнение учебников'), tab: 'textbooks' }];
  const base = c.textbooks;
  if (!base || !base.ref) return { intent: 'textbooks', text: [t('Оқулықтарды салыстыруға дерек жеткіліксіз.', 'Данных для сравнения учебников недостаточно.')], actions };
  const tb = idx ? compareTextbooks(c.region, base.ref, idx) : base;
  if (!tb || !tb.ref) return { intent: 'textbooks', text: [t(`${label} бойынша оқулықтарды салыстыруға дерек жеткіліксіз.`, `Для сравнения учебников по теме ${label} данных недостаточно.`)], actions };
  const head = label
    ? t(`${label} бойынша ${tb.ref}-мен салыстырғанда (облыс, мектеп құрамына түзетілген):`, `${label}: по сравнению с ${tb.ref} (по области, с поправкой на состав школ):`)
    : t(`${tb.ref}-мен салыстырғанда (облыс бойынша, мектеп құрамына түзетілген):`, `По сравнению с ${tb.ref} (по области, с поправкой на состав школ):`);
  return { intent: 'textbooks', text: [head, ...textbookLines(c, tb)].slice(0, 6), actions };
}

function rankingAnswer(c: AssistContext, q: string, topic: number | null): AssistReply {
  const t = tr(c);
  const byClass = has(q, /сынып|класс/);
  const ranked = rankUnits(c.region, byClass ? 'class' : 'school', topic ?? undefined);
  if (!ranked.length) return { intent: 'ranking', text: [t('Рейтинг жасауға дерек жеткіліксіз.', 'Недостаточно данных для рейтинга.')], actions: [] };
  const best = has(q, RE.strong) && !has(q, RE.weak);
  const list = best ? [...ranked].reverse().slice(0, 3) : ranked.slice(0, 3);
  const label = (r: Ranked) => (r.unit ? `${r.school}, ${r.unit}` : r.school);
  const what = topic !== null ? t(`«${c.region.topics[topic].name.kk}» тақырыбы бойынша`, `по теме «${c.region.topics[topic].name.ru}»`) : t('барлық тақырып бойынша', 'по всем темам');
  const avg = topic !== null ? c.regionStats[topic].mastery : mean(c.regionStats.filter((s) => s.status !== 'nodata').map((s) => s.mastery));
  return {
    intent: 'ranking',
    text: [
      best
        ? t(`Меңгеру үлесі ең жоғары ${byClass ? 'сыныптар' : 'мектептер'} (${what}):`, `${byClass ? 'Классы' : 'Школы'} с самой высокой долей усвоивших (${what}):`)
        : t(`Меңгеру үлесі ең төмен ${byClass ? 'сыныптар' : 'мектептер'} (${what}):`, `${byClass ? 'Классы' : 'Школы'} с самой низкой долей усвоивших (${what}):`),
      ...list.map((r, k) => `${k + 1}. ${label(r)} — ${f(r.mastery)}% (${r.n} ${t('оқушы', 'уч.')})`),
      t(`Облыс орташасы — ${f(avg)}%. Бұл рейтинг мектептің бастапқы деңгейін ескермейді: мұғалімді бағалау үшін емес, көмекті қайда бағыттау керегін көру үшін.`, `Среднее по области — ${f(avg)}%. Рейтинг не учитывает входной уровень: он показывает, куда направить помощь, а не оценивает учителей.`),
    ],
    actions: list.map((r) => ({ label: label(r), tab: 'overview' as AssistTab, scope: { school: r.school, unit: r.unit } })),
  };
}

function hoursAnswer(c: AssistContext): AssistReply {
  const t = tr(c);
  const name = (i: number) => c.ds.topics[i].name[c.lang];
  const where = c.scopeLabel ?? t('облыс бойынша', 'по области');
  const eff = predictEffect(c.model, c.recommended);
  const moves = c.recommended.map((h, i) => ({ i, d: h - c.model.topics[i].planned })).filter((m) => m.d !== 0);
  const ups = moves.filter((m) => m.d > 0).sort((a, b) => eff.per[b.i].delta - eff.per[a.i].delta);
  const downs = moves.filter((m) => m.d < 0);
  if (!ups.length) {
    return { intent: 'hours', text: [t(`Жоспарды өзгертуге негіз жоқ (${where}): жоспардағы ${c.model.total} сағатты жылжытудың пайдасына жеткілікті дәлел табылмады.`, `Оснований менять план нет (${where}): достаточных подтверждений пользы от переноса ${c.model.total} ч не найдено.`)], actions: [{ label: t('Сағат жоспары', 'План часов'), tab: 'hours' }] };
  }
  const moved = ups.reduce((a, m) => a + m.d, 0);
  return {
    intent: 'hours',
    text: [
      t(`Жылдық ${c.model.total} сағатты өзгертпей, ${moved} сағатты жылжытуды ұсынамын. Күтілетін орташа өсім: ${sg(eff.avg, 2)} ± ${f(eff.avgHalf, 2)} балл.`, `Не меняя годовые ${c.model.total} ч, рекомендую перенести ${moved} ч. Ожидаемый средний прирост: ${sg(eff.avg, 2)} ± ${f(eff.avgHalf, 2)} балла.`),
      t('Қосу:', 'Добавить:') + ' ' + ups.slice(0, 4).map((m) => `«${name(m.i)}» +${m.d} (${sg(eff.per[m.i].delta)})`).join('; ') + '.',
      downs.length ? t('Азайту (жақсы меңгерілген тақырыптар):', 'Сократить (хорошо усвоенные темы):') + ' ' + downs.slice(0, 4).map((m) => `«${name(m.i)}» ${m.d}`).join('; ') + '.' : '',
    ].filter(Boolean),
    actions: [{ label: t('Сағат жоспарын ашу', 'Открыть план часов'), tab: 'hours' }],
  };
}

function todoAnswer(c: AssistContext): AssistReply {
  const t = tr(c);
  const name = (i: number) => c.ds.topics[i].name[c.lang];
  const usable = c.stats.filter((s) => s.status !== 'nodata');
  const hard = usable.filter((s) => s.status === 'hard').sort((a, b) => a.mastery - b.mastery);
  const steps: string[] = [];
  const actions: AssistAction[] = [];
  // 1. Себеп тірек тақырыпта болса — алдымен соны
  const roots = [...new Map(hard.filter((s) => s.prereq?.root).map((s) => [s.prereq!.i, s])).values()];
  if (roots[0]?.prereq) {
    const r = roots[0];
    steps.push(t(`Тірек тақырыпты күшейту: «${name(r.prereq!.i)}» (${f(r.prereq!.mastery)}%) — «${name(r.i)}» (${f(r.mastery)}%) осыған байланысты (r = ${f(r.prereq!.r, 2)}).`, `Укрепить опорную тему «${name(r.prereq!.i)}» (${f(r.prereq!.mastery)}%) — от неё зависит «${name(r.i)}» (${f(r.mastery)}%, r = ${f(r.prereq!.r, 2)}).`));
    actions.push({ label: name(r.prereq!.i), tab: 'topics', topic: r.prereq!.i });
  } else if (hard[0]) {
    steps.push(t(`Ең қиын тақырыпқа әдістемелік көмек: «${name(hard[0].i)}» — ${f(hard[0].mastery)}%.`, `Методическая помощь по самой сложной теме: «${name(hard[0].i)}» — ${f(hard[0].mastery)}%.`));
    actions.push({ label: name(hard[0].i), tab: 'topics', topic: hard[0].i });
  }
  // 2. Сағатты жылжыту
  const eff = predictEffect(c.model, c.recommended);
  const ups = c.recommended.map((h, i) => ({ i, d: h - c.model.topics[i].planned })).filter((m) => m.d > 0).sort((a, b) => eff.per[b.i].delta - eff.per[a.i].delta);
  if (ups.length) {
    steps.push(t(`Сағатты жылжыту: ${ups.slice(0, 2).map((m) => `«${name(m.i)}» +${m.d} (${sg(eff.per[m.i].delta)} балл)`).join(', ')}; жалпы ${c.model.total} сағат өзгермейді.`, `Перенести часы: ${ups.slice(0, 2).map((m) => `«${name(m.i)}» +${m.d} (${sg(eff.per[m.i].delta)} балла)`).join(', ')}; всего ${c.model.total} ч не меняется.`));
    actions.push({ label: t('Сағат жоспары', 'План часов'), tab: 'hours' });
  }
  // 3. Оқулық
  const better = c.textbooks?.rows.filter((r) => r.verdict === 'better').sort((a, b) => (b.adj ?? 0) - (a.adj ?? 0))[0];
  if (better && c.textbooks) steps.push(t(`Оқулық таңдағанда: ${better.name} ${c.textbooks.ref}-ға қарағанда мәнді жоғары (${sg(better.adj)} балл, ${sg(better.sdUnits, 2)} SD).`, `При выборе учебника: ${better.name} значимо выше ${c.textbooks.ref} (${sg(better.adj)} балла, ${sg(better.sdUnits, 2)} SD).`));
  // 4. Көмекті қайда бағыттау
  if (!c.scopeLabel) {
    const weak = rankUnits(c.region, 'school').slice(0, 2);
    if (weak.length) {
      steps.push(t(`Әдістемелік қолдау: ${weak.map((r) => `${r.school} (${f(r.mastery)}%)`).join(', ')} — меңгеру үлесі ең төмен.`, `Методическая поддержка: ${weak.map((r) => `${r.school} (${f(r.mastery)}%)`).join(', ')} — самая низкая доля усвоивших.`));
      actions.push({ label: weak[0].school, tab: 'overview', scope: { school: weak[0].school, unit: null } });
    }
  }
  if (!steps.length) return { intent: 'todo', text: [t('Деректе шұғыл әрекетті қажет ететін мәселе табылмады: қиын тақырып жоқ, сағатты жылжытуға негіз жоқ.', 'В данных не найдено проблем, требующих срочных действий: сложных тем нет, оснований переносить часы нет.')], actions: [] };
  return { intent: 'todo', text: [t(`Деректер бойынша басымдықтар (${c.scopeLabel ?? 'облыс'}):`, `Приоритеты по данным (${c.scopeLabel ?? 'область'}):`), ...steps.map((s, k) => `${k + 1}. ${s}`)], actions: actions.slice(0, 3) };
}

// ================= Ұсынылатын сұрақтар =================

export const SUGGESTIONS = {
  kk: ['Ең қиын тақырыптар қандай?', 'Не істеу керек?', 'Қай оқулық тиімдірек?', 'Сағатты қалай бөлген жөн?', 'Ең әлсіз мектептер', 'Сенім аралығы деген не?'],
  ru: ['Какие темы самые сложные?', 'Что делать?', 'Какой учебник эффективнее?', 'Как распределить часы?', 'Самые слабые школы', 'Что такое доверительный интервал?'],
};

/** Ағымдағы дерек пен таңдауға сай сұрақтар: тақырып атаулары нақты курстан алынады */
export function suggestions(c: AssistContext): string[] {
  const t = tr(c);
  const name = (i: number) => c.ds.topics[i].name[c.lang];
  const hard = c.stats.filter((s) => s.status !== 'nodata').sort((a, b) => a.mastery - b.mastery);
  const gain = c.model.topics.filter((h) => h.evidence !== 'none').sort((a, b) => b.perHour - a.perHour)[0];
  const sec = c.ds.topics[hard[0]?.i ?? 0]?.section[c.lang];
  const out = [
    t('Ең қиын тақырыптар қандай?', 'Какие темы самые сложные?'),
    t('Не істеу керек?', 'Что делать?'),
    hard[0] ? t(`«${name(hard[0].i)}» неге қиын?`, `Почему трудна тема «${name(hard[0].i)}»?`) : '',
    gain ? t(`«${name(gain.i)}» тақырыбына 2 сағат қоссақ не болады?`, `Что будет, если добавить 2 часа на «${name(gain.i)}»?`) : '',
    c.scopeLabel ? t('Облыспен салыстырғанда әлсіз тақырыптар', 'Слабые темы по сравнению с областью') : t('Ең әлсіз мектептер', 'Самые слабые школы'),
    t('Қай оқулық тиімдірек?', 'Какой учебник эффективнее?'),
    sec ? t(`«${sec}» бөлімі қалай?`, `Как дела с разделом «${sec}»?`) : '',
    t('Сенім аралығы деген не?', 'Что такое доверительный интервал?'),
  ];
  return out.filter(Boolean);
}

// ================= Claude режимі =================

/** Claude режиміне берілетін ықшам дерек контексті */
export function contextForModel(c: AssistContext): string {
  const { ds, stats, model, lang } = c;
  const L = (x: { kk: string; ru: string }) => x[lang];
  const r1 = (x: number) => (Number.isNaN(x) ? null : Number(x.toFixed(1)));
  const eff = predictEffect(model, c.recommended);
  const secs = sections(ds).names.map((sec) => {
    const idx = ds.topics.map((t, i) => (t.section.kk === sec.kk ? i : -1)).filter((i) => i >= 0);
    const ok = idx.filter((i) => stats[i].status !== 'nodata');
    return {
      section: L(sec),
      topics: idx.length,
      mean_mastery_pct: ok.length ? r1(mean(ok.map((i) => stats[i].mastery))) : null,
      hard_topics: ok.filter((i) => stats[i].status === 'hard').length,
      hours_planned: idx.reduce((a, i) => a + model.topics[i].planned, 0),
      hours_recommended: idx.reduce((a, i) => a + c.recommended[i], 0),
    };
  });
  const weakest = rankUnits(c.region, 'school')
    .slice(0, 5)
    .map((r) => {
      const mo = masteryOf(c.region, (u) => c.region.units[u].school === r.school);
      return {
        school: r.school,
        mastery_pct: r1(r.mastery),
        students: r.n,
        textbook: [...new Set(c.region.units.filter((u) => u.school === r.school).map((u) => u.textbook))].join(', '),
        most_behind_region: gaps(mo.per, c.regionStats)
          .slice(0, 2)
          .map((g) => ({ topic: L(c.region.topics[g.i].name), mastery_pct: r1(g.m), region_pct: r1(g.reg) })),
      };
    });
  return JSON.stringify({
    subject: L(ds.subject),
    grade: ds.grade,
    scope: c.scopeLabel ?? 'region',
    synthetic: ds.synthetic,
    students: ds.students.length,
    schools_in_region: new Set(c.region.units.map((u) => u.school)).size,
    topics: ds.topics.map((t, i) => ({
      topic: L(t.name),
      section: L(t.section),
      mastery_pct: r1(stats[i].mastery),
      ci95: Number.isNaN(stats[i].lo) ? null : [r1(stats[i].lo), r1(stats[i].hi)],
      mean_score: r1(stats[i].mean),
      students: stats[i].n,
      status: stats[i].status,
      region_mastery_pct: c.scopeLabel ? r1(c.regionStats[i].mastery) : undefined,
      prerequisite: stats[i].prereq ? { topic: L(ds.topics[stats[i].prereq!.i].name), mastery_pct: r1(stats[i].prereq!.mastery), r: Number(stats[i].prereq!.r.toFixed(2)), likely_root_cause: stats[i].prereq!.root } : null,
      hours_planned: t.planned,
      hours_recommended: c.recommended[i],
      hours_trusted_range: [model.topics[i].min, model.topics[i].max],
      expected_score_change: Number(eff.per[i].delta.toFixed(2)),
      plus_one_hour_effect: Number(model.topics[i].perHour.toFixed(2)),
      hours_gain_log: Number(model.topics[i].gain.toFixed(2)),
      hours_evidence: model.topics[i].evidence,
    })),
    sections: secs,
    textbooks_region: c.textbooks?.rows.map((r) => ({ textbook: r.name, students: r.n, classes: r.units, mean: r1(r.rawMean), naive_diff: r.naive, adjusted_effect: r.adj, ci95: r.lo === null ? null : [r.lo, r.hi], p: r.p, sd_units: r.sdUnits, verdict: r.verdict })),
    textbook_reference: c.textbooks?.ref,
    hours_total: model.total,
    expected_avg_change: Number(eff.avg.toFixed(2)),
    weakest_schools: weakest,
  });
}
