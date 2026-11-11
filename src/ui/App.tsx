import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, Filter, L10n, Lang, Scope } from '../lib/types';
import { COURSES, DEFAULT_COURSE, getCourse } from '../lib/generate';
import { applyFilter, applyScope, compareTextbooks, fitHours, recommendHours, topicStats } from '../lib/analysis';
import type { AssistContext } from '../lib/assistant';
import type { ImportedCourse } from '../lib/csv';
import { Ctx, Icon, Logo, Tab, TFn } from './common';
import { Overview } from './Overview';
import { Topics } from './Topics';
import { Textbooks } from './Textbooks';
import { Hours } from './Hours';
import { DataPage } from './DataPage';
import { Assistant } from './Assistant';
import { Search, SearchItem } from './Search';

/** Каталогтағы бір курс: пән + параллель */
interface Course {
  key: string;
  subject: L10n;
  grade: number;
  get: () => Dataset;
}

const DEMO: Course[] = COURSES.map((c) => ({ key: c.key, subject: c.subject, grade: c.grade, get: () => getCourse(c.key) }));
const ALL = '__all__';
const schoolNo = (s: string) => Number(s.match(/\d+/)?.[0] ?? 0);
const bySchool = (a: string, b: string) => schoolNo(a) - schoolNo(b) || a.localeCompare(b);

export function App() {
  const [lang, setLang] = useState<Lang>('kk');
  const [tab, setTab] = useState<Tab>('overview');
  const [catalog, setCatalog] = useState<Course[]>(DEMO);
  const [courseKey, setCourseKey] = useState(DEFAULT_COURSE);
  const [school, setSchool] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ loc: 'all', lang: 'all' });
  const [refBook, setRefBook] = useState<string | undefined>(undefined);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState<{ q: string; n: number } | null>(null);
  const [focusTopic, setFocusTopic] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);
  const firstNav = useRef<HTMLButtonElement>(null);
  const t: TFn = (kk, ru) => (lang === 'kk' ? kk : ru);

  useEffect(() => {
    document.documentElement.lang = lang === 'kk' ? 'kk' : 'ru';
  }, [lang]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  // Телефондағы мәзір: Esc жабады, ашылғанда фокус бірінші пунктке
  useEffect(() => {
    if (!navOpen) return;
    firstNav.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const go = useCallback((next: Tab) => {
    setTab(next);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, []);
  const notify = useCallback((msg: string) => setToast((p) => ({ msg, n: (p?.n ?? 0) + 1 })), []);
  const openTopic = useCallback(
    (i: number) => {
      setFocusTopic(i);
      go('topics');
    },
    [go],
  );
  const setScope = useCallback((s: string | null, u: string | null) => {
    setSchool(s);
    setUnitName(u);
  }, []);
  const openAssistant = useCallback((q?: string) => {
    setAiOpen(true);
    setNavOpen(false);
    if (q) setAiSeed((p) => ({ q, n: (p?.n ?? 0) + 1 }));
  }, []);

  const course = catalog.find((c) => c.key === courseKey) ?? catalog[0];
  const source = useMemo(() => course.get(), [course]);
  const subjects = [...new Map(catalog.map((c) => [c.subject.kk, c.subject])).values()];
  const grades = catalog.filter((c) => c.subject.kk === course.subject.kk).sort((a, b) => a.grade - b.grade);
  const schools = useMemo(() => [...new Set(source.units.map((u) => u.school))].sort(bySchool), [source]);
  const classes = school ? source.units.map((u, i) => ({ u, i })).filter(({ u }) => u.school === school && u.name) : [];
  const unitIdx = school && unitName ? source.units.findIndex((u) => u.school === school && u.name === unitName) : -1;
  const scope: Scope = { school: school && schools.includes(school) ? school : null, unit: unitIdx >= 0 ? unitIdx : null };

  const pickCourse = (key: string) => {
    setCourseKey(key);
    setRefBook(undefined);
    setFocusTopic(null);
    // Мектеп келесі курста да болса, таңдау сақталады; сынып литері де сақталады (8Ә → 9Ә)
    const next = catalog.find((c) => c.key === key);
    if (unitName && next) setUnitName(next.grade ? `${next.grade}${unitName.replace(/^\d+/, '')}` : null);
  };
  const pickSubject = (kk: string) => {
    const options = catalog.filter((c) => c.subject.kk === kk);
    pickCourse((options.find((c) => c.grade === course.grade) ?? options[0]).key);
  };

  const ctx: Ctx = useMemo(() => {
    const scoped = scope.school !== null;
    const region = scoped ? source : applyFilter(source, filter);
    const ds = scoped ? applyScope(source, scope) : region;
    const regionStats = topicStats(region);
    const stats = scoped ? topicStats(ds, { local: true }) : regionStats;
    const model = fitHours(region);
    const unit = scope.unit !== null ? source.units[scope.unit] : null;
    return {
      ds,
      region,
      regionStats,
      scope,
      scopeLabel: scope.school ? (unit ? `${scope.school}, ${unit.name}` : scope.school) : null,
      lang,
      t: (kk: string, ru: string) => (lang === 'kk' ? kk : ru),
      stats,
      textbooks: compareTextbooks(region, refBook),
      model,
      recommended: recommendHours(model, stats),
      go,
      notify,
      focusTopic,
      openTopic,
      setScope,
      openAssistant,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, filter, lang, refBook, scope.school, scope.unit, focusTopic]);

  const ax: AssistContext = useMemo(
    () => ({ lang, ds: ctx.ds, region: ctx.region, stats: ctx.stats, regionStats: ctx.regionStats, textbooks: ctx.textbooks, model: ctx.model, recommended: ctx.recommended, scopeLabel: ctx.scopeLabel }),
    [ctx, lang],
  );

  const sel = (l: L10n) => (lang === 'kk' ? l.kk : l.ru);
  const pages: [Tab, string, string][] = [
    ['overview', t('Басқару панелі', 'Панель управления'), 'overview'],
    ['topics', t('Тақырыптар', 'Темы'), 'topics'],
    ['textbooks', t('Оқулықтар', 'Учебники'), 'book'],
    ['hours', t('Оқу сағаттары', 'Учебные часы'), 'clock'],
  ];

  const searchItems: SearchItem[] = useMemo(() => {
    const items: SearchItem[] = [];
    pages.forEach(([id, label, icon]) => items.push({ id: `p-${id}`, label, hint: t('бет', 'страница'), icon, run: () => go(id) }));
    items.push({ id: 'p-data', label: t('Дерек жүктеу', 'Загрузка данных'), hint: t('бет', 'страница'), icon: 'data', run: () => go('data') });
    items.push({ id: 'p-ai', label: t('ИИ көмекші', 'ИИ-помощник'), hint: t('құрал', 'инструмент'), icon: 'sparkle', run: () => openAssistant() });
    source.topics.forEach((tp, i) => items.push({ id: `t-${i}`, label: tp.name[lang], hint: `${t('тақырып', 'тема')} · ${tp.section[lang]}`, icon: 'topics', run: () => openTopic(i) }));
    schools.forEach((s) => items.push({ id: `s-${s}`, label: s, hint: t('мектеп', 'школа'), icon: 'school', run: () => setScope(s, null) }));
    source.units.forEach((u) => u.name && items.push({ id: `u-${u.id}`, label: `${u.school}, ${u.name}`, hint: t('сынып', 'класс'), icon: 'users', run: () => setScope(u.school, u.name) }));
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, schools, lang]);

  const filtered = !scope.school && (filter.loc !== 'all' || filter.lang !== 'all');
  const titleOf: Record<Tab, string> = { overview: t('Басқару панелі', 'Панель управления'), topics: t('Тақырыптар', 'Темы'), textbooks: t('Оқулықтар', 'Учебники'), hours: t('Оқу сағаттары', 'Учебные часы'), data: t('Дерек', 'Данные') };

  return (
    <>
      <a className="skip" href="#main">
        {t('Негізгі мазмұнға өту', 'Перейти к содержимому')}
      </a>
      <div className="shell">
        <aside className={`sidebar ${navOpen ? 'open' : ''}`} id="sidebar" aria-label={t('Бүйір мәзір', 'Боковое меню')}>
          <div>
            <div className="side-brand">
              <span className="brand">
                <Logo size={38} />
                <span>
                  <strong>
                    Oqu<span className="wm-light">Analytics</span>
                  </strong>
                  <small>{t('Білім аналитикасы', 'Аналитика обучения')}</small>
                </span>
              </span>
              <button className="icon-btn side-close" onClick={() => setNavOpen(false)} aria-label={t('Мәзірді жабу', 'Закрыть меню')}>
                <Icon name="close" />
              </button>
            </div>
            <nav className="side-nav" aria-label={t('Негізгі мәзір', 'Главное меню')}>
              <div className="side-label">{t('Талдау', 'Аналитика')}</div>
              {pages.map(([id, label, icon], k) => (
                <button key={id} ref={k === 0 ? firstNav : undefined} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
                  <Icon name={icon} size={18} />
                  {label}
                </button>
              ))}
              <div className="side-label">{t('Құралдар', 'Инструменты')}</div>
              <button className="ai-link" onClick={() => openAssistant()} aria-expanded={aiOpen}>
                <Icon name="sparkle" size={18} />
                {t('ИИ көмекші', 'ИИ-помощник')}
                <span className="tag">AI</span>
              </button>
              <button aria-current={tab === 'data' ? 'page' : undefined} onClick={() => go('data')}>
                <Icon name="data" size={18} />
                {t('Дерек жүктеу', 'Загрузка данных')}
              </button>
            </nav>
          </div>
          <div className="side-foot">
            <div className="scope-card">
              <span className="ic">
                <Icon name="school" size={18} />
              </span>
              <div>
                <b>{ctx.scopeLabel ?? t('Жамбыл облысы', 'Жамбылская область')}</b>
                <span>
                  {sel(source.subject)}
                  {source.grade ? ` · ${t(`${source.grade}-сынып`, `${source.grade} класс`)}` : ''} · {ctx.ds.students.length.toLocaleString('ru-RU')} {t('оқушы', 'уч.')}
                </span>
              </div>
            </div>
            <div className="seg" role="group" aria-label="Тіл / Язык">
              {(['kk', 'ru'] as Lang[]).map((l) => (
                <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} style={{ flex: 1 }}>
                  {l === 'kk' ? 'Қазақша' : 'Русский'}
                </button>
              ))}
            </div>
          </div>
        </aside>
        {navOpen && <div className="backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}

        <div className="main-col">
          <header className="appbar">
            <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label={t('Мәзірді ашу', 'Открыть меню')} aria-controls="sidebar" aria-expanded={navOpen}>
              <Icon name="menu" />
            </button>
            <span className="app-title">{titleOf[tab]}</span>
            <Search items={searchItems} t={t} open={searchOpen} onDone={() => setSearchOpen(false)} />
            <span className="grow" />
            <button className="icon-btn search-toggle" onClick={() => setSearchOpen((v) => !v)} aria-label={t('Іздеу', 'Поиск')} aria-expanded={searchOpen}>
              <Icon name="search" />
            </button>
            <button className="ai-btn" onClick={() => (aiOpen ? setAiOpen(false) : openAssistant())} aria-expanded={aiOpen}>
              <Icon name="sparkle" size={17} />
              <span className="lbl">{t('ИИ көмекші', 'ИИ-помощник')}</span>
            </button>
          </header>

          <div className="wrap">
            <section className="card scopebar" aria-label={t('Не көрсетілетінін таңдау', 'Выбор того, что показать')}>
              <label className="pick">
                <span>{t('Пән', 'Предмет')}</span>
                <select value={course.subject.kk} onChange={(e) => pickSubject(e.target.value)}>
                  {subjects.map((s) => (
                    <option key={s.kk} value={s.kk}>
                      {sel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pick">
                <span>{t('Параллель', 'Параллель')}</span>
                <select value={course.key} onChange={(e) => pickCourse(e.target.value)}>
                  {grades.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.grade ? t(`${c.grade}-сыныптар`, `${c.grade}-е классы`) : '—'}
                    </option>
                  ))}
                </select>
              </label>
              <span className="scope-sep" aria-hidden="true">
                <Icon name="chevron" size={16} />
              </span>
              <label className="pick">
                <span>{t('Мектеп', 'Школа')}</span>
                <select
                  value={scope.school ?? ALL}
                  onChange={(e) => {
                    setSchool(e.target.value === ALL ? null : e.target.value);
                    setUnitName(null);
                  }}
                >
                  <option value={ALL}>{t('Бүкіл облыс', 'Вся область')}</option>
                  {schools.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pick">
                <span>{t('Сынып', 'Класс')}</span>
                <select value={scope.unit !== null ? unitName! : ALL} disabled={!scope.school || !classes.length} onChange={(e) => setUnitName(e.target.value === ALL ? null : e.target.value)}>
                  <option value={ALL}>{scope.school ? t('Барлық сыныптар', 'Все классы') : '—'}</option>
                  {classes.map(({ u }) => (
                    <option key={u.id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              {scope.school && (
                <button className="btn ghost sm" onClick={() => setScope(null, null)}>
                  <Icon name="reset" size={15} />
                  {t('Облысқа қайту', 'К области')}
                </button>
              )}
            </section>

            <section className="context" aria-label={t('Көрсетілген дерек', 'Отображаемые данные')}>
              <span className="dataset">
                {source.synthetic && <span className="pill pill-synth">{t('Синтетикалық дерек', 'Синтетические данные')}</span>}
                <b>
                  {sel(source.subject)}
                  {source.grade ? ` · ${t(`${source.grade}-сынып`, `${source.grade} класс`)}` : ''} · {ctx.scopeLabel ?? t('Жамбыл облысы', 'Жамбылская область')}
                </b>
                <span className="muted tnum">
                  {ctx.ds.students.length.toLocaleString('ru-RU')} {t('оқушы', 'учеников')}
                  {scope.unit !== null && ` · ${source.units[scope.unit].textbook}`}
                  {filtered ? ` · ${t('сүзгі қосулы', 'фильтр включён')}` : ''}
                </span>
              </span>
              {!scope.school && (
                <span className="filters">
                  <label className="field">
                    {t('Елді мекен', 'Местность')}
                    <select value={filter.loc} onChange={(e) => setFilter({ ...filter, loc: e.target.value as Filter['loc'] })}>
                      <option value="all">{t('Барлығы', 'Все')}</option>
                      <option value="urban">{t('Қала', 'Город')}</option>
                      <option value="rural">{t('Ауыл', 'Село')}</option>
                    </select>
                  </label>
                  <label className="field">
                    {t('Оқыту тілі', 'Язык обучения')}
                    <select value={filter.lang} onChange={(e) => setFilter({ ...filter, lang: e.target.value as Filter['lang'] })}>
                      <option value="all">{t('Барлығы', 'Все')}</option>
                      <option value="kk">{t('Қазақша', 'Казахский')}</option>
                      <option value="ru">{t('Орысша', 'Русский')}</option>
                    </select>
                  </label>
                </span>
              )}
            </section>

            <main key={tab} id="main" tabIndex={-1}>
              {tab === 'overview' && <Overview c={ctx} />}
              {tab === 'topics' && <Topics c={ctx} />}
              {tab === 'textbooks' && <Textbooks c={ctx} setRefBook={setRefBook} />}
              {tab === 'hours' && <Hours key={`${course.key}|${filter.loc}|${filter.lang}|${scope.school}|${scope.unit}`} c={ctx} />}
              {tab === 'data' && (
                <DataPage
                  c={ctx}
                  synthetic={source.synthetic}
                  onLoad={(courses: ImportedCourse[]) => {
                    const next = courses.map((x) => ({ key: x.key, subject: x.ds.subject, grade: x.ds.grade, get: () => x.ds }));
                    setCatalog(next);
                    setCourseKey(next[0].key);
                    setScope(null, null);
                    setFilter({ loc: 'all', lang: 'all' });
                    setRefBook(undefined);
                    notify(t('Дерек жүктелді', 'Данные загружены'));
                  }}
                  onReset={() => {
                    setCatalog(DEMO);
                    setCourseKey(DEFAULT_COURSE);
                    setScope(null, null);
                    notify(t('Демо дерекке қайттыңыз', 'Возврат к демо-данным'));
                  }}
                />
              )}
            </main>

            <footer>
              <Icon name="info" size={15} />
              {t(
                'Zhambyl Hub Hackathon 2026, «Data-Driven Curriculum» кейсі. Барлық есеп браузерде орындалады, дерек ешқайда жіберілмейді (Claude режимінен басқа).',
                'Zhambyl Hub Hackathon 2026, кейс «Data-Driven Curriculum». Все расчёты выполняются в браузере, данные никуда не отправляются (кроме режима Claude).',
              )}
            </footer>
          </div>
        </div>
      </div>

      <Assistant c={ctx} ax={ax} open={aiOpen} onClose={() => setAiOpen(false)} seed={aiSeed} />

      {toast && (
        <div className="toast" role="status" key={toast.n}>
          <Icon name="check" size={16} />
          {toast.msg}
        </div>
      )}
    </>
  );
}
