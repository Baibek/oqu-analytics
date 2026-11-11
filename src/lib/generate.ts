import type { Dataset, L10n, Student, Topic, Unit } from './types';
import {
  ALGEBRA_7, ALGEBRA_8, ALGEBRA_9, CHEMISTRY_8, CHEMISTRY_9, GEOMETRY_7, GEOMETRY_8, GEOMETRY_9, PHYSICS_7, PHYSICS_8, PHYSICS_9,
} from './curriculum';
import { gauss, rng, sum } from './stats';

// Демо дерегінің генераторы. Дерек СИНТЕТИКАЛЫҚ: мектептер де, баллдар да ойдан алынған.
// 8-сынып физикасына әдейі «дұрыс жауаптар» салынған (TRUTH), сондықтан талдау әдістері
// оларды таба ма, жоқ па — тесттермен тексеруге болады.

export const TRUTH = {
  /** Оқулықтың шынайы әсері, балл (A — салыстыру негізі) */
  textbook: { 'Оқулық A': 0, 'Оқулық B': 3, 'Оқулық C': 0.3, 'Оқулық D': 5 } as Record<string, number>,
  /** B оқулығының «Тұрақты электр тогы» бөліміндегі қосымша әсері */
  bCurrentBonus: 4,
  /** Сағатқа сезімталдық: балл = gain · ln(нақты сағат / жоспар) */
  hoursGain: { t04: 18, t10: 15, t14: 25, t15: 22 } as Record<string, number>,
  hoursGainDefault: 4,
  hoursGainNone: ['t01', 't03', 't17'],
};

/** Оқу бағдарламалары: 2025 жылғы қыркүйектен бастап кейбір мектептер жаңартылған бағдарламаны сынақтан өткізеді */
export const PROGRAM_CURRENT = 'Қолданыстағы бағдарлама';
export const PROGRAM_PILOT = 'Жаңартылған бағдарлама (пилот)';

/**
 * Пилоттық бағдарламаның 8-сынып физикасындағы шынайы әсері, балл (бөлімнің орысша атауының басы бойынша).
 * Электростатикада пилот жақсы, жылу құбылыстарында сәл нашар, жалпы алғанда ≈ 0:
 * (+5 · 3 тақырып − 3 · 5 тақырып) / 20 = 0.
 */
export const PROGRAM_TRUTH = {
  current: PROGRAM_CURRENT,
  pilot: PROGRAM_PILOT,
  /** Бөлім бойынша әсер */
  sections: [
    { sectionRu: 'Основы электростатики', value: 5 },
    { sectionRu: 'Тепловые явления', value: -3 },
  ],
  /** Барлық тақырып бойынша орташа әсер */
  overall: 0,
};

/**
 * Пилот мектептер кездейсоқ таңдалмаған: олар көбіне қалада (қалалық мектептердің жартысы,
 * ауылдықтардың 6-уы). Сондықтан қарапайым салыстыру пилотты асыра бағалайды.
 * Ереже детерминистік: кездейсоқ сандар ағыны өзгермейді.
 */
const isPilot = (s: number, urban: boolean) => (urban ? s % 2 === 0 : s % 7 === 3);

const PHYS8_BASE: Record<string, number> = {
  t01: 72, t02: 66, t03: 70, t04: 52, t05: 47, t06: 63, t07: 58, t08: 50, t09: 55, t10: 54,
  t11: 46, t12: 50, t13: 62, t14: 49, t15: 41, t16: 51, t17: 68, t18: 48, t19: 57, t20: 53,
};

const DISTRICTS = ['Байзақ', 'Жамбыл', 'Жуалы', 'Қордай', 'Меркі', 'Мойынқұм', 'Сарысу', 'Талас', 'Т. Рысқұлов', 'Шу'];
const LETTERS = ['А', 'Ә', 'Б'];

// Қалалық мектептер A оқулығын жиі таңдайды, ауылдықтар — B мен C-ны.
// Сондықтан орташа баллдарды тікелей салыстыру оқулықты емес, мектептерді салыстырады.
const mix = (a: number, b: number, c: number) => [...Array(a).fill('Оқулық A'), ...Array(b).fill('Оқулық B'), ...Array(c).fill('Оқулық C')] as string[];
const URBAN_MIX = mix(14, 3, 3);
const RURAL_MIX = [...mix(8, 21, 12)].sort((x, y) => ((x.charCodeAt(7) * 7) % 5) - ((y.charCodeAt(7) * 7) % 5));

const N_SCHOOLS = 64;

interface CohortSchool {
  s: number;
  school: string;
  district: string;
  urban: boolean;
  lang: 'kk' | 'ru';
  textbook: string;
  program: string;
  quality: number;
  classes: { k: number; ability: number; baselines: number[] }[];
}

const cohorts = new Map<number, CohortSchool[]>();
/** Бір параллельдің оқушылар тобы: барлық пәнге ортақ */
export function cohort(grade: number): CohortSchool[] {
  const hit = cohorts.get(grade);
  if (hit) return hit;
  const r = rng(5000 + grade);
  const out: CohortSchool[] = [];
  for (let s = 0; s < N_SCHOOLS; s++) {
    const urban = s < 20;
    const quality = gauss(r) * 4;
    out.push({
      s,
      school: `№${s + 1} мектеп`,
      district: urban ? 'Тараз қ.' : DISTRICTS[s % DISTRICTS.length],
      urban,
      lang: r() < 0.7 ? 'kk' : 'ru',
      // Соңғы үш мектеп — D оқулығы: қорытынды жасауға дерек әдейі жеткіліксіз
      textbook: s >= N_SCHOOLS - 3 ? 'Оқулық D' : urban ? URBAN_MIX[s] : RURAL_MIX[(s - 20) % RURAL_MIX.length],
      program: isPilot(s, urban) ? PROGRAM_PILOT : PROGRAM_CURRENT,
      quality,
      classes: Array.from({ length: urban ? 2 + (s % 2) : 1 }, (_, k) => {
        const ability = gauss(r) * 2;
        const size = urban ? 22 + Math.floor(r() * 9) : 14 + Math.floor(r() * 10);
        return { k, ability, baselines: Array.from({ length: size }, () => 52 + (urban ? 12 : 0) + quality + ability + gauss(r) * 12) };
      }),
    });
  }
  cohorts.set(grade, out);
  return out;
}

export interface CourseSpec {
  key: string;
  subject: L10n;
  grade: number;
  topics: Topic[];
  seed: number;
  /** Тақырыптың базалық балы; берілмесе генерацияланады */
  base?: Record<string, number>;
  /** Сағатқа сезімталдық; берілмесе генерацияланады */
  gain?: Record<string, number>;
  book?: Record<string, number>;
  /** Бір оқулықтың бір бөлімдегі қосымша әсері */
  bonus?: { book: string; sectionRu: string; value: number };
  /** Пилоттық бағдарламаның бөлім бойынша әсері; берілмесе 0 */
  pilot?: { sectionRu: string; value: number }[];
}

const SUBJ = {
  alg: { kk: 'Алгебра', ru: 'Алгебра' },
  geo: { kk: 'Геометрия', ru: 'Геометрия' },
  phys: { kk: 'Физика', ru: 'Физика' },
  chem: { kk: 'Химия', ru: 'Химия' },
};

export const COURSES: CourseSpec[] = [
  { key: 'alg-7', subject: SUBJ.alg, grade: 7, topics: ALGEBRA_7, seed: 71 },
  { key: 'alg-8', subject: SUBJ.alg, grade: 8, topics: ALGEBRA_8, seed: 81 },
  { key: 'alg-9', subject: SUBJ.alg, grade: 9, topics: ALGEBRA_9, seed: 91 },
  { key: 'geo-7', subject: SUBJ.geo, grade: 7, topics: GEOMETRY_7, seed: 72 },
  { key: 'geo-8', subject: SUBJ.geo, grade: 8, topics: GEOMETRY_8, seed: 82 },
  { key: 'geo-9', subject: SUBJ.geo, grade: 9, topics: GEOMETRY_9, seed: 92 },
  { key: 'phys-7', subject: SUBJ.phys, grade: 7, topics: PHYSICS_7, seed: 73 },
  {
    key: 'phys-8',
    subject: SUBJ.phys,
    grade: 8,
    topics: PHYSICS_8,
    seed: 2026,
    base: PHYS8_BASE,
    gain: Object.fromEntries(PHYSICS_8.map((t) => [t.id, TRUTH.hoursGainNone.includes(t.id) ? 0 : (TRUTH.hoursGain[t.id] ?? TRUTH.hoursGainDefault)])),
    book: TRUTH.textbook,
    bonus: { book: 'Оқулық B', sectionRu: 'Постоянный', value: TRUTH.bCurrentBonus },
    pilot: PROGRAM_TRUTH.sections,
  },
  { key: 'phys-9', subject: SUBJ.phys, grade: 9, topics: PHYSICS_9, seed: 93 },
  { key: 'chem-8', subject: SUBJ.chem, grade: 8, topics: CHEMISTRY_8, seed: 84 },
  { key: 'chem-9', subject: SUBJ.chem, grade: 9, topics: CHEMISTRY_9, seed: 94 },
];

export const DEFAULT_COURSE = 'phys-8';

export function generateCourse(spec: CourseSpec): Dataset {
  const r = rng(spec.seed);
  const topics = spec.topics;
  // Берілмеген параметрлерді курстың өз seed-імен қайталанатын түрде жасаймыз
  const base = spec.base ?? Object.fromEntries(topics.map((t) => [t.id, Math.round(66 - (t.prereq.length ? 7 : 0) - r() * 20)]));
  const gain = spec.gain ?? Object.fromEntries(topics.map((t) => [t.id, base[t.id] < 52 && r() < 0.6 ? 14 + Math.round(r() * 10) : r() < 0.25 ? 0 : 4]));
  const book = spec.book ?? { 'Оқулық A': 0, 'Оқулық B': Math.round((r() * 5 - 1.5) * 10) / 10, 'Оқулық C': Math.round((r() * 3 - 1.5) * 10) / 10, 'Оқулық D': 2 };

  const units: Unit[] = [];
  const students: Student[] = [];

  // Мектептер, сыныптар және оқушылар параллельге ортақ: 8Ә сыныбының оқушылары
  // алгебрада да, физикада да сол адамдар. Пәнге тек баллдар, сағаттар және мұғалім әсері тән.
  const co = cohort(spec.grade);
  // Бағдарлама әсері тақырып бойынша (кездейсоқ сан қолданбайды)
  const pilotFx = topics.map((t) => sum((spec.pilot ?? []).filter((p) => t.section.ru.startsWith(p.sectionRu)).map((p) => p.value)));
  for (const sc of co) {
    for (const cl of sc.classes) {
      const ui = units.length;
      const unit: Unit = {
        id: `u${sc.s + 1}-${cl.k + 1}`,
        school: sc.school,
        name: `${spec.grade}${LETTERS[cl.k]}`,
        district: sc.district,
        urban: sc.urban,
        lang: sc.lang,
        textbook: sc.textbook,
        program: sc.program,
        hours: topics.map((t) => Math.max(1, t.planned + Math.round(gauss(r) * Math.max(1.1, t.planned * 0.15)))),
      };
      units.push(unit);
      // Мұғалімнің нақты тақырыпты қалай өткізгені: пән мен тақырыпқа тән сынып әсері
      const topicFx = topics.map(() => gauss(r) * 3);
      const teacherFx = gauss(r) * 1.5;
      cl.baselines.forEach((baseline, n) => {
        const noise: Record<string, number> = {};
        const scores = topics.map((t, i) => {
          // Тірек тақырыпты меңгермеген оқушы келесісінде де қиналады
          const own = gauss(r) * 11;
          const e = t.prereq.length ? 0.45 * noise[t.prereq[0]] + own : own;
          noise[t.id] = e;
          const tb = (book[sc.textbook] ?? 0) + (spec.bonus && sc.textbook === spec.bonus.book && t.section.ru.startsWith(spec.bonus.sectionRu) ? spec.bonus.value : 0);
          const v = base[t.id] - 5 + topicFx[i] + 0.7 * (baseline - 55) + (sc.urban ? 5 : 0) + sc.quality + cl.ability + teacherFx + tb + (sc.program === PROGRAM_PILOT ? pilotFx[i] : 0) + gain[t.id] * Math.log(unit.hours[i] / t.planned) + e;
          return Math.round(Math.min(100, Math.max(0, v)));
        });
        students.push({ id: `${unit.id}-${n + 1}`, unit: ui, baseline: Math.round(Math.min(100, Math.max(0, baseline))), scores });
      });
    }
  }
  return { label: `${spec.subject.kk}, ${spec.grade}-сынып`, subject: spec.subject, grade: spec.grade, synthetic: true, hasBaseline: true, topics, units, students };
}

const cache = new Map<string, Dataset>();
export function getCourse(key: string): Dataset {
  let ds = cache.get(key);
  if (!ds) {
    const spec = COURSES.find((c) => c.key === key) ?? COURSES.find((c) => c.key === DEFAULT_COURSE)!;
    ds = generateCourse(spec);
    cache.set(key, ds);
  }
  return ds;
}

/** 8-сынып физикасы: тесттер мен үлгі файлдар үшін */
export const generateDemo = () => generateCourse(COURSES.find((c) => c.key === DEFAULT_COURSE)!);
