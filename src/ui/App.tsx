import { useMemo, useState } from 'react';
import type { Dataset, Filter, Lang } from '../lib/types';
import { generateDemo } from '../lib/generate';
import { applyFilter, compareTextbooks, fitHours, recommendHours, topicStats } from '../lib/analysis';
import type { Ctx, Tab, TFn } from './common';
import { Overview } from './Overview';
import { Topics } from './Topics';
import { Textbooks } from './Textbooks';
import { Hours } from './Hours';
import { DataPage } from './DataPage';

const demo = generateDemo();

export function App() {
  const [lang, setLang] = useState<Lang>('kk');
  const [tab, setTab] = useState<Tab>('overview');
  const [source, setSource] = useState<Dataset>(demo);
  const [filter, setFilter] = useState<Filter>({ loc: 'all', lang: 'all' });
  const [refBook, setRefBook] = useState<string | undefined>(undefined);
  const t: TFn = (kk, ru) => (lang === 'kk' ? kk : ru);

  const ctx: Ctx = useMemo(() => {
    const ds = applyFilter(source, filter);
    const stats = topicStats(ds);
    const model = fitHours(ds);
    return {
      ds,
      lang,
      t: (kk: string, ru: string) => (lang === 'kk' ? kk : ru),
      stats,
      textbooks: compareTextbooks(ds, refBook),
      model,
      recommended: recommendHours(model, stats),
      go: setTab,
    };
  }, [source, filter, lang, refBook]);

  const tabs: [Tab, string][] = [
    ['overview', t('Шолу', 'Обзор')],
    ['topics', t('Тақырыптар', 'Темы')],
    ['textbooks', t('Оқулықтар', 'Учебники')],
    ['hours', t('Сағаттар', 'Часы')],
    ['data', t('Дерек', 'Данные')],
  ];
  const filtered = filter.loc !== 'all' || filter.lang !== 'all';

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <strong>Oqu Analytics</strong>
            <span className="sub">{t('Әдіскерге арналған оқу нәтижелерін талдау', 'Аналитика учебных результатов для методиста')}</span>
          </div>
        </div>
        <div className="lang" role="group" aria-label="Тіл / Язык">
          {(['kk', 'ru'] as Lang[]).map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {l === 'kk' ? 'Қаз' : 'Рус'}
            </button>
          ))}
        </div>
      </header>

      <nav className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="bar">
        <span className="dataset">
          {source.synthetic && <span className="pill pill-synth">{t('Синтетикалық дерек', 'Синтетические данные')}</span>}
          {source.synthetic ? t('Демо: 8-сынып, физика, Жамбыл облысы', 'Демо: 8 класс, физика, Жамбылская область') : source.label}
          <span className="muted">
            {' · '}
            {ctx.ds.students.length} {t('оқушы', 'учеников')}
            {filtered ? ` (${t('сүзгімен', 'с фильтром')})` : ''}
          </span>
        </span>
        <span className="filters">
          <label>
            {t('Елді мекен', 'Местность')}
            <select value={filter.loc} onChange={(e) => setFilter({ ...filter, loc: e.target.value as Filter['loc'] })}>
              <option value="all">{t('Барлығы', 'Все')}</option>
              <option value="urban">{t('Қала', 'Город')}</option>
              <option value="rural">{t('Ауыл', 'Село')}</option>
            </select>
          </label>
          <label>
            {t('Оқыту тілі', 'Язык обучения')}
            <select value={filter.lang} onChange={(e) => setFilter({ ...filter, lang: e.target.value as Filter['lang'] })}>
              <option value="all">{t('Барлығы', 'Все')}</option>
              <option value="kk">{t('Қазақша', 'Казахский')}</option>
              <option value="ru">{t('Орысша', 'Русский')}</option>
            </select>
          </label>
        </span>
      </div>

      <main>
        {tab === 'overview' && <Overview c={ctx} />}
        {tab === 'topics' && <Topics c={ctx} />}
        {tab === 'textbooks' && <Textbooks c={ctx} refBook={ctx.textbooks?.ref ?? ''} setRefBook={setRefBook} />}
        {tab === 'hours' && <Hours key={`${source.label}|${filter.loc}|${filter.lang}`} c={ctx} />}
        {tab === 'data' && (
          <DataPage
            c={ctx}
            source={source}
            onLoad={(ds) => {
              setSource(ds);
              setFilter({ loc: 'all', lang: 'all' });
              setRefBook(undefined);
            }}
            onReset={() => setSource(demo)}
          />
        )}
      </main>

      <footer>
        {t(
          'Oqu Analytics · Zhambyl Hub Hackathon 2026, «Data-Driven Curriculum» кейсі. Барлық есеп браузерде орындалады, дерек ешқайда жіберілмейді.',
          'Oqu Analytics · Zhambyl Hub Hackathon 2026, кейс «Data-Driven Curriculum». Все расчёты выполняются в браузере, данные никуда не отправляются.',
        )}
      </footer>
    </div>
  );
}
