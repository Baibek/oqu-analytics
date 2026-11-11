import type { Dataset, Student, Unit } from './types';
import { PHYSICS_8 } from './curriculum';
import { gauss, rng } from './stats';

// Демо дерегінің генераторы. Дерек СИНТЕТИКАЛЫҚ: мектептер де, баллдар да ойдан алынған.
// Ішіне әдейі «дұрыс жауаптар» салынған (TRUTH), сондықтан талдау әдістері
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

const BASE: Record<string, number> = {
  t01: 72, t02: 66, t03: 70, t04: 52, t05: 47, t06: 63, t07: 58, t08: 50, t09: 55, t10: 54,
  t11: 46, t12: 50, t13: 62, t14: 49, t15: 41, t16: 51, t17: 68, t18: 48, t19: 57, t20: 53,
};

const DISTRICTS = ['Байзақ', 'Жамбыл', 'Жуалы', 'Қордай', 'Меркі', 'Мойынқұм', 'Сарысу', 'Талас', 'Т. Рысқұлов', 'Шу'];

// Қалалық мектептер A оқулығын жиі таңдайды, ауылдықтар — B мен C-ны.
// Сондықтан орташа баллдарды тікелей салыстыру оқулықты емес, мектептерді салыстырады.
const mix = (a: number, b: number, c: number) => [...Array(a).fill('Оқулық A'), ...Array(b).fill('Оқулық B'), ...Array(c).fill('Оқулық C')] as string[];
const URBAN_MIX = mix(14, 3, 3);
const RURAL_MIX = [...mix(8, 21, 12)].sort((x, y) => ((x.charCodeAt(7) * 7) % 5) - ((y.charCodeAt(7) * 7) % 5));

export function generateDemo(seed = 2026): Dataset {
  const r = rng(seed);
  const topics = PHYSICS_8;
  const units: Unit[] = [];
  const students: Student[] = [];
  const N_SCHOOLS = 64;

  for (let s = 0; s < N_SCHOOLS; s++) {
    const urban = s < 20;
    // Соңғы үш мектеп — D оқулығы: қорытынды жасауға дерек әдейі жеткіліксіз
    const textbook = s >= N_SCHOOLS - 3 ? 'Оқулық D' : urban ? URBAN_MIX[s] : RURAL_MIX[(s - 20) % RURAL_MIX.length];
    const unit: Unit = {
      id: `u${s + 1}`,
      school: `№${s + 1} мектеп`,
      district: urban ? 'Тараз қ.' : DISTRICTS[s % DISTRICTS.length],
      urban,
      lang: r() < 0.7 ? 'kk' : 'ru',
      textbook,
      hours: topics.map((t) => Math.max(1, t.planned + Math.round(gauss(r) * 1.1))),
    };
    units.push(unit);

    const quality = gauss(r) * 4;
    // Мұғалімнің нақты тақырыпты қалай өткізгені: тақырыпқа тән мектеп әсері
    const topicFx = topics.map(() => gauss(r) * 3);
    const size = urban ? 30 + Math.floor(r() * 16) : 15 + Math.floor(r() * 16);
    for (let k = 0; k < size; k++) {
      const baseline = 52 + (urban ? 12 : 0) + quality + gauss(r) * 12;
      const noise: Record<string, number> = {};
      const scores = topics.map((t, i) => {
        // Тірек тақырыпты меңгермеген оқушы келесісінде де қиналады
        const own = gauss(r) * 11;
        const e = t.prereq.length ? 0.45 * noise[t.prereq[0]] + own : own;
        noise[t.id] = e;
        const gain = TRUTH.hoursGainNone.includes(t.id) ? 0 : (TRUTH.hoursGain[t.id] ?? TRUTH.hoursGainDefault);
        const tb = TRUTH.textbook[textbook] + (textbook === 'Оқулық B' && t.section.ru.startsWith('Постоянный') ? TRUTH.bCurrentBonus : 0);
        const v = BASE[t.id] - 5 + topicFx[i] + 0.7 * (baseline - 55) + (urban ? 5 : 0) + quality + tb + gain * Math.log(unit.hours[i] / t.planned) + e;
        return Math.round(Math.min(100, Math.max(0, v)));
      });
      students.push({ id: `${unit.id}-${k + 1}`, unit: s, baseline: Math.round(Math.min(100, Math.max(0, baseline))), scores });
    }
  }
  return { label: 'Демо: 8-сынып, физика, Жамбыл облысы', synthetic: true, hasBaseline: true, topics, units, students };
}
