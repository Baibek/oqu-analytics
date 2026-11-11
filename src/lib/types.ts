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

/** Сынып тобы: бір мектеп, бір оқулық, бір оқыту тілі */
export interface Unit {
  id: string;
  school: string;
  district: string;
  urban: boolean;
  lang: Lang;
  textbook: string;
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
