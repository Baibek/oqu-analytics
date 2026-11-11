import { useEffect, useMemo, useState } from 'react';
import type { Dataset, Filter, Lang } from '../lib/types';
import { generateDemo } from '../lib/generate';
import { applyFilter, compareTextbooks, fitHours, recommendHours, topicStats } from '../lib/analysis';
import { Ctx, Icon, Tab, TFn } from './common';
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

  useEffect(() => {
    document.documentElement.lang = lang === 'kk' ? 'kk' : 'ru';
  }, [lang]);

  const go = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0 });
  };

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
      go,
    };
  }, [source, filter, lang, refBook]);

  const tabs: [Tab, string, string][] = [
    ['overview', t('Шолу', 'Обзор'), 'overview'],
    ['topics', t('Тақырыптар', 'Темы'), 'topics'],
    ['textbooks', t('Оқулықтар', 'Учебники'), 'book'],
    ['hours', t('Сағаттар', 'Часы'), 'clock'],
    ['data', t('Дерек', 'Данные'), 'data'],
  ];
  const filtered = filter.loc !== 'all' || filter.lang !== 'all';

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="logo" aria-hidden="true">
              <Icon name="overview" size={18} />
            </span>
            <span>
              <strong>Oqu Analytics</strong>
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
        <div className="context">
          <span className="dataset">
            {source.synthetic && <span className="pill pill-synth">{t('Синтетикалық дерек', 'Синтетические данные')}</span>}
            <b>{source.synthetic ? t('8-сынып · Физика · Жамбыл облысы', '8 класс · Физика · Жамбылская область') : source.label}</b>
            <span className="muted tnum">
              {ctx.ds.students.length.toLocaleString('ru-RU')} {t('оқушы', 'учеников')}
              {filtered ? ` · ${t('сүзгі қосулы', 'фильтр включён')}` : ''}
            </span>
          </span>
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
        </div>

        <main key={tab}>
          {tab === 'overview' && <Overview c={ctx} />}
          {tab === 'topics' && <Topics c={ctx} />}
          {tab === 'textbooks' && <Textbooks c={ctx} setRefBook={setRefBook} />}
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
