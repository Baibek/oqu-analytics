import type { ReactNode } from 'react';
import type { Dataset, Lang, Scope } from '../lib/types';
import type { HourModel, Status, TextbookResult, TopicStat, Verdict, Evidence } from '../lib/analysis';

export type TFn = (kk: string, ru: string) => string;
export type Tab = 'overview' | 'topics' | 'textbooks' | 'hours' | 'data' | 'report';

/** Барлық экранға ортақ есептелген нәтижелер */
export interface Ctx {
  /** Таңдалған аяның дерегі (облыс, мектеп немесе сынып) */
  ds: Dataset;
  /** Бүкіл облыс (сүзгімен): оқулық салыстыруы мен сағат моделі осыдан есептеледі */
  region: Dataset;
  regionStats: TopicStat[];
  scope: Scope;
  /** Мысалы «№5 мектеп · 8Ә»; облыс таңдалса null */
  scopeLabel: string | null;
  lang: Lang;
  t: TFn;
  stats: TopicStat[];
  textbooks: TextbookResult | null;
  model: HourModel;
  recommended: number[];
  go: (tab: Tab) => void;
  /** Төменгі оң жақтағы қысқа хабарлама */
  notify: (msg: string) => void;
  /** Тақырыптар бетінде ашылатын тақырып (іздеуден немесе ИИ-дан) */
  focusTopic: number | null;
  openTopic: (i: number) => void;
  /** Мектеп пен сыныпты таңдау (сынып атауы бойынша) */
  setScope: (school: string | null, unit: string | null) => void;
  openAssistant: (question?: string) => void;
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
  menu: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  close: 'M18 6 6 18M6 6l12 12',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  school: 'M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M12 10h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  trendUp: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  trendDown: 'M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  report: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  bot: 'M12 8V4H8M4 12a8 8 0 0 1 8-8M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a8 8 0 0 0-8-8M9 13v2M15 13v2',
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Oqu Analytics белгісі: ашық кітаптан өсіп шығатын нәтиже бағандары */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Oqu Analytics">
      <defs>
        <linearGradient id="oqu-logo-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#oqu-logo-g)" />
      <rect x="8.4" y="14.3" width="3.4" height="5.2" rx="1.2" fill="#fff" opacity=".7" />
      <rect x="14.3" y="10.5" width="3.4" height="9" rx="1.2" fill="#fff" opacity=".85" />
      <rect x="20.2" y="6" width="3.4" height="13.5" rx="1.2" fill="#fbbf24" />
      <path d="M5 21.6c3.6-1.7 7.3-1.5 11 .7V26c-3.7-2.2-7.4-2.4-11-.7z" fill="#fff" />
      <path d="M27 21.6c-3.6-1.7-7.3-1.5-11 .7V26c3.7-2.2 7.4-2.4 11-.7z" fill="#fff" opacity=".85" />
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

/** Таңдау аясы облыстан тар болғанда көрсетілетін түсіндірме */
export function ScopeNote({ c, what }: { c: Ctx; what: 'textbooks' | 'hours' | 'topics' }) {
  const { t } = c;
  if (!c.scopeLabel) return null;
  const book = c.scope.unit !== null ? c.region.units[c.scope.unit]?.textbook : c.region.units.find((u) => u.school === c.scope.school)?.textbook;
  const text = {
    topics: t(
      `Көрсетілген: ${c.scopeLabel}. Әр тақырыптың жанында облыс бойынша көрсеткіш тұр; жолақтағы тік сызық — облыс деңгейі.`,
      `Показано: ${c.scopeLabel}. Рядом с каждой темой — показатель по области; вертикальная черта на полосе — уровень области.`,
    ),
    textbooks: t(
      `Оқулықтарды бір мектептің дерегімен әділ салыстыру мүмкін емес, сондықтан салыстыру бүкіл облыс бойынша жасалады. ${c.scopeLabel} ${book ?? '—'} оқулығымен оқиды (кестеде белгіленген).`,
      `Честно сравнить учебники по данным одной школы нельзя, поэтому сравнение сделано по всей области. ${c.scopeLabel} занимается по учебнику ${book ?? '—'} (отмечен в таблице).`,
    ),
    hours: t(
      `Ұсыныс ${c.scopeLabel} үшін: қай тақырып әлсіз екені осы сыныптың нәтижесінен, ал қосымша сағаттың қаншалықты көмектесетіні бүкіл облыс деректерінен алынған.`,
      `Рекомендация для: ${c.scopeLabel}. Какие темы слабые — по результатам этого класса, а насколько помогает дополнительный час — по данным всей области.`,
    ),
  }[what];
  return (
    <div className="note note-scope">
      <Icon name="info" />
      <div>{text}</div>
    </div>
  );
}
