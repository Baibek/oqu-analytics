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

// ---- Иконкалар (сыртқы кітапханасыз, 24×24 сызықтық) ----
const PATHS: Record<string, string> = {
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  topics: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  check: 'M20 6 9 17l-5-5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  upload: 'M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  download: 'M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  print: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
  save: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8M7 21v-7h10v7',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  link: 'M9 15 15 9M10 6l1-1a5 5 0 0 1 7 7l-1 1M14 18l-1 1a5 5 0 0 1-7-7l1-1',
  chevron: 'm9 6 6 6-6 6',
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Pill({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`pill pill-${kind}`}>{children}</span>;
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div className={`note note-${kind}`} role={kind === 'warn' ? 'alert' : undefined}>
      <Icon name={kind === 'warn' ? 'alert' : 'info'} />
      <div>{children}</div>
    </div>
  );
}

/** Терминді қарапайым тілмен түсіндіретін «?» белгісі (тінтуір мен пернетақтаға) */
export function Hint({ text }: { text: string }) {
  return (
    <span className="hint" tabIndex={0} aria-label={text}>
      ?<span className="hint-pop" role="tooltip">
        {text}
      </span>
    </span>
  );
}

/** Әр беттің басы: тақырып және «бұл бет қандай сұраққа жауап береді» */
export function PageHead({ title, question, children }: { title: string; question: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="lead">{question}</p>
      </div>
      {children && <div className="page-tools">{children}</div>}
    </div>
  );
}

/** Терминдер сөздігі: бір жерде, екі тілде */
export const glossary = (t: TFn) => ({
  ci: t(
    '95% сенім аралығы: нақты мән 95% ықтималдықпен осы аралықта жатыр. Дерек аз болған сайын аралық кеңейеді.',
    '95% доверительный интервал: истинное значение с вероятностью 95% лежит в этом диапазоне. Чем меньше данных, тем он шире.',
  ),
  mastery: t('Меңгеру үлесі: тақырып бойынша 50 және одан жоғары балл алған оқушылардың пайызы.', 'Доля усвоивших: процент учеников, набравших по теме 50 баллов и выше.'),
  sd: t(
    'SD (стандарт ауытқу) бірлігі: әсердің оқушылар арасындағы әдеттегі айырмамен салыстырғандағы көлемі. 0,1 SD — шағын, 0,3 SD — байқалатын әсер.',
    'Единицы SD (стандартного отклонения): размер эффекта относительно обычного разброса между учениками. 0,1 SD — малый, 0,3 SD — заметный эффект.',
  ),
  p: t(
    'p-мән: айырмашылық шын мәнінде жоқ болса, мұндай нәтиженің кездейсоқ шығу ықтималдығы. 0,05-тен кіші болса, айырма «мәнді» деп саналады.',
    'p-значение: вероятность получить такой результат случайно, если разницы на самом деле нет. Если меньше 0,05, разница считается «значимой».',
  ),
  adjusted: t(
    'Түзетілген әсер: бастапқы деңгейі, елді мекені және оқыту тілі бірдей оқушыларды салыстырғандағы айырма. Мектептің өзі емес, оқулықтың үлесі.',
    'Эффект с поправкой: разница при сравнении учеников с одинаковым входным уровнем, местностью и языком обучения. Вклад учебника, а не самой школы.',
  ),
  naive: t('Қарапайым айырма: орташа баллдардың тікелей айырмасы. Мектептердің құрамы әртүрлі болса, адастыруы мүмкін.', 'Простая разница: прямая разница средних баллов. Может вводить в заблуждение, если состав школ разный.'),
  evidence: t(
    'Сенімділік: сағаты көп сыныптарда нәтиже жоғары екені деректе қаншалықты анық байқалады. «Жоғары» — кездейсоқтыққа жатқызуға болмайды.',
    'Уверенность: насколько ясно в данных видно, что в классах с большим числом часов результат выше. «Высокая» — нельзя списать на случайность.',
  ),
});
