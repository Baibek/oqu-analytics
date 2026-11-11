import { useEffect, useMemo, useState } from 'react';
import type { Dataset, Filter, L10n, Lang, Scope } from '../lib/types';
import { COURSES, DEFAULT_COURSE, getCourse } from '../lib/generate';
import { applyFilter, applyScope, compareTextbooks, fitHours, recommendHours, topicStats } from '../lib/analysis';
import type { ImportedCourse } from '../lib/csv';
import { Ctx, Icon, Logo, Tab, TFn } from './common';
import { Overview } from './Overview';
import { Topics } from './Topics';
import { Textbooks } from './Textbooks';
import { Hours } from './Hours';
import { DataPage } from './DataPage';

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
  const t: TFn = (kk, ru) => (lang === 'kk' ? kk : ru);

  useEffect(() => {
    document.documentElement.lang = lang === 'kk' ? 'kk' : 'ru';
  }, [lang]);

  const go = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  const course = catalog.find((c) => c.key === courseKey) ?? catalog[0];
  const source = useMemo(() => course.get(), [course]);
  const subjects = [...new Map(catalog.map((c) => [c.subject.kk, c.subject])).values()];
  const grades = catalog.filter((c) => c.subject.kk === course.subject.kk).sort((a, b) => a.grade - b.grade);
  const schools = [...new Set(source.units.map((u) => u.school))].sort(bySchool);
  const classes = school ? source.units.map((u, i) => ({ u, i })).filter(({ u }) => u.school === school && u.name) : [];
  const unitIdx = school && unitName ? (source.units.findIndex((u) => u.school === school && u.name === unitName) as number) : -1;
  const scope: Scope = { school: school && schools.includes(school) ? school : null, unit: unitIdx >= 0 ? unitIdx : null };

  const pickCourse = (key: string) => {
    setCourseKey(key);
    setRefBook(undefined);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, filter, lang, refBook, scope.school, scope.unit]);

  const tabs: [Tab, string, string][] = [
    ['overview', t('Шолу', 'Обзор'), 'overview'],
    ['topics', t('Тақырыптар', 'Темы'), 'topics'],
    ['textbooks', t('Оқулықтар', 'Учебники'), 'book'],
    ['hours', t('Сағаттар', 'Часы'), 'clock'],
    ['data', t('Дерек', 'Данные'), 'data'],
  ];
  const filtered = !scope.school && (filter.loc !== 'all' || filter.lang !== 'all');
  const sel = (l: L10n) => (lang === 'kk' ? l.kk : l.ru);

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <Logo />
            <span>
              <strong>
                Oqu<span className="wm-light">Analytics</span>
              </strong>
              <small>{t('Әдіскерге арналған талдау', 'Аналитика для методиста')}</small>
            </span>
          </div>
          <nav className="nav" aria-label={t('Негізгі мәзір', 'Главное меню')}>
            {tabs.map(([id, label, icon]) => (
              <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
                <Icon name={icon} size={17} />
                {label}
              </button>
            ))}
          </nav>
          <div className="seg" role="group" aria-label="Тіл / Язык">
            {(['kk', 'ru'] as Lang[]).map((l) => (
              <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l === 'kk' ? 'Қаз' : 'Рус'}
              </button>
            ))}
          </div>
        </div>
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
            <button
              className="btn ghost sm"
              onClick={() => {
                setSchool(null);
                setUnitName(null);
              }}
            >
              <Icon name="reset" size={15} />
              {t('Облысқа қайту', 'К области')}
            </button>
          )}
        </section>

        <div className="context">
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
        </div>

        <main key={tab}>
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
                setSchool(null);
                setUnitName(null);
                setFilter({ loc: 'all', lang: 'all' });
                setRefBook(undefined);
              }}
              onReset={() => {
                setCatalog(DEMO);
                setCourseKey(DEFAULT_COURSE);
                setSchool(null);
                setUnitName(null);
              }}
            />
          )}
        </main>

        <footer>
          <Icon name="info" size={15} />
          {t(
            'Zhambyl Hub Hackathon 2026, «Data-Driven Curriculum» кейсі. Барлық есеп браузерде орындалады, дерек ешқайда жіберілмейді.',
            'Zhambyl Hub Hackathon 2026, кейс «Data-Driven Curriculum». Все расчёты выполняются в браузере, данные никуда не отправляются.',
          )}
        </footer>
      </div>
    </>
  );
}
