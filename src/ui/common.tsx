import type { ReactNode } from 'react';
import type { Dataset, Lang } from '../lib/types';
import type { HourModel, Status, TextbookResult, TopicStat, Verdict, Evidence } from '../lib/analysis';

export type TFn = (kk: string, ru: string) => string;
export type Tab = 'overview' | 'topics' | 'textbooks' | 'hours' | 'data';

/** Барлық экранға ортақ есептелген нәтижелер */
export interface Ctx {
  ds: Dataset;
  lang: Lang;
  t: TFn;
  stats: TopicStat[];
  textbooks: TextbookResult | null;
  model: HourModel;
  recommended: number[];
  go: (tab: Tab) => void;
}

export const fmt = (x: number | null | undefined, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(d).replace('.', ',').replace('-', '−'));
export const signed = (x: number | null | undefined, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? '—' : (x > 0 ? '+' : '') + fmt(x, d));

export const statusLabel = (s: Status, t: TFn) =>
  ({ hard: t('Қиын', 'Сложная'), watch: t('Назарда', 'В зоне риска'), ok: t('Қалыпты', 'В норме'), nodata: t('Дерек жеткіліксіз', 'Мало данных') })[s];

export const verdictLabel = (v: Verdict, t: TFn) =>
  ({
    ref: t('Салыстыру негізі', 'База сравнения'),
    better: t('Мәнді жоғары', 'Значимо выше'),
    worse: t('Мәнді төмен', 'Значимо ниже'),
    unproven: t('Айырмашылық дәлелденбеген', 'Разница не доказана'),
    nodata: t('Дерек жеткіліксіз', 'Мало данных'),
  })[v];

export const evidenceLabel = (e: Evidence, t: TFn) => ({ strong: t('жоғары', 'высокая'), weak: t('орташа', 'средняя'), none: t('төмен', 'низкая') })[e];

export function Pill({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`pill pill-${kind}`}>{children}</span>;
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'warn'; children: ReactNode }) {
  return <div className={`note note-${kind}`}>{children}</div>;
}
