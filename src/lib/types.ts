export type Lang = 'kk' | 'ru';
export type L10n = { kk: string; ru: string };

export interface Topic {
  id: string;
  name: L10n;
  section: L10n;
  /** Оқу жоспарындағы сағат */
  planned: number;
  /** Алдыңғы (тірек) тақырыптардың id-лері */
  prereq: string[];
}

/** Бір сынып (мысалы, №5 мектеп, 8Ә): бір оқулық, бір оқыту тілі */
export interface Unit {
  id: string;
  school: string;
  /** Сынып атауы, мысалы «8Ә» (белгісіз болса бос) */
  name: string;
  district: string;
  urban: boolean;
  lang: Lang;
  textbook: string;
  /** Оқу бағдарламасы (мысалы, қолданыстағы не пилоттық жаңартылған), белгісіз болса бос жол */
  program: string;
  /** Әр тақырыпқа нақты өткізілген сағат (topics ретімен), белгісіз болса NaN */
  hours: number[];
}

export interface Student {
  id: string;
  unit: number;
  /** Бастапқы диагностика балы (0–100), жоқ болса NaN */
  baseline: number;
  /** Әр тақырып бойынша балл (0–100), тапсырмаса NaN */
  scores: number[];
}

export interface Dataset {
  label: string;
  /** Пән */
  subject: L10n;
  /** Параллель (сынып деңгейі), белгісіз болса 0 */
  grade: number;
  synthetic: boolean;
  hasBaseline: boolean;
  topics: Topic[];
  units: Unit[];
  students: Student[];
}

export interface Filter {
  loc: 'all' | 'urban' | 'rural';
  lang: 'all' | Lang;
}

/** Таңдау аясы: бүкіл облыс, бір мектеп немесе бір сынып */
export interface Scope {
  school: string | null;
  /** Unit индексі */
  unit: number | null;
}
