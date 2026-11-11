import { useState } from 'react';
import type { Dataset } from '../lib/types';
import { CURRICULUM_COLS, download, exportCurriculum, exportResults, ImportIssue, importData, RESULT_COLS } from '../lib/csv';
import { HARD, MIN_STUDENTS, MIN_UNITS, PASS, WATCH } from '../lib/analysis';
import { generateDemo } from '../lib/generate';
import { Ctx, Note } from './common';

const readFile = (f: File) => f.text();

export function DataPage({ c, source, onLoad, onReset }: { c: Ctx; source: Dataset; onLoad: (ds: Dataset) => void; onReset: () => void }) {
  const { t, lang } = c;
  const [results, setResults] = useState<File | null>(null);
  const [plan, setPlan] = useState<File | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [loaded, setLoaded] = useState<string>('');

  const issueText = (i: ImportIssue) =>
    ({
      missing_cols: t(`Міндетті бағандар жоқ: ${i.detail}`, `Нет обязательных столбцов: ${i.detail}`),
      bad_score: t(`${i.detail} жол өткізілді: балл бос немесе 0–100 аралығынан тыс`, `Пропущено строк: ${i.detail} — балл пустой или вне диапазона 0–100`),
      no_rows: t('Жарамды жол табылмады', 'Не найдено ни одной корректной строки'),
      unknown_topic: t(`Оқу жоспарында жоқ тақырыптар өткізілді: ${i.detail}`, `Пропущены темы, которых нет в учебном плане: ${i.detail}`),
      bad_hours: t(`Жоспарлы сағат дұрыс емес: ${i.detail}`, `Некорректные плановые часы: ${i.detail}`),
    })[i.code];

  const run = async () => {
    if (!results) return;
    const r = importData(await readFile(results), plan ? await readFile(plan) : undefined, results.name);
    setIssues(r.issues);
    if (r.ds) {
      onLoad(r.ds);
      setLoaded(`${r.ds.students.length} ${t('оқушы', 'учеников')}, ${r.ds.topics.length} ${t('тақырып', 'тем')}, ${new Set(r.ds.units.map((u) => u.school)).size} ${t('мектеп', 'школ')}`);
    } else setLoaded('');
  };

  const sample = generateDemo();
  const desc: Record<string, [string, string, boolean]> = {
    student_id: ['Оқушы коды (аты-жөні емес)', 'Код ученика (не ФИО)', true],
    school: ['Мектеп', 'Школа', true],
    district: ['Аудан', 'Район', false],
    locality: ['urban / rural (қала / ауыл)', 'urban / rural (город / село)', false],
    language: ['kk / ru — оқыту тілі', 'kk / ru — язык обучения', false],
    textbook: ['Оқулық (авторы, баспасы, жылы)', 'Учебник (автор, издательство, год)', true],
    baseline: ['Бастапқы диагностика балы, 0–100. Онсыз оқулықтар әділ салыстырылмайды', 'Балл входной диагностики, 0–100. Без него учебники нельзя сравнить честно', false],
    topic: ['Тақырып (оқу жоспарындағыдай)', 'Тема (как в учебном плане)', true],
    score: ['Тақырып бойынша балл, 0–100 (мысалы, БЖБ нәтижесі)', 'Балл по теме, 0–100 (например, результат СОР)', true],
    hours: ['Сыныпта осы тақырыпқа нақты өткізілген сағат', 'Фактически проведённые часы по теме в классе', false],
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>{t('Дерек', 'Данные')}</h1>
          <p className="lead">
            {t(
              'Өз нәтижелеріңізді CSV форматында жүктеңіз. Файл браузерде өңделеді және ешқайда жіберілмейді. Excel-де «CSV UTF-8» ретінде сақтаңыз; үтір де, нүктелі үтір де қабылданады.',
              'Загрузите свои результаты в формате CSV. Файл обрабатывается в браузере и никуда не отправляется. В Excel сохраняйте как «CSV UTF-8»; подходит и запятая, и точка с запятой.',
            )}
          </p>
        </div>
      </div>

      <section className="cards two">
        <article className="card">
          <h2>{t('1. Үлгіні жүктеп алыңыз', '1. Скачайте шаблон')}</h2>
          <p className="small">{t('Үлгілер демо дерегінен жасалған: форматты көру үшін ашып қараңыз.', 'Шаблоны собраны из демо-данных: откройте, чтобы увидеть формат.')}</p>
          <div className="actions">
            <button className="btn" onClick={() => download('results-template.csv', exportResults(sample, lang, 2))}>
              results.csv
            </button>
            <button className="btn" onClick={() => download('curriculum-template.csv', exportCurriculum(sample, lang))}>
              curriculum.csv
            </button>
          </div>
        </article>
        <article className="card">
          <h2>{t('2. Файлдарды таңдаңыз', '2. Выберите файлы')}</h2>
          <label className="file">
            <span>{t('Нәтижелер (міндетті)', 'Результаты (обязательно)')}</span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setResults(e.target.files?.[0] ?? null)} />
          </label>
          <label className="file">
            <span>{t('Оқу жоспары (міндетті емес)', 'Учебный план (необязательно)')}</span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setPlan(e.target.files?.[0] ?? null)} />
          </label>
          <div className="actions">
            <button className="btn primary" disabled={!results} onClick={run}>
              {t('Жүктеу және талдау', 'Загрузить и проанализировать')}
            </button>
            {!source.synthetic && (
              <button className="btn" onClick={onReset}>
                {t('Демо дерекке қайту', 'Вернуться к демо')}
              </button>
            )}
          </div>
          {loaded && <Note>{t('Жүктелді: ', 'Загружено: ') + loaded}</Note>}
          {issues.map((i, k) => (
            <Note key={k} kind="warn">
              {issueText(i)}
            </Note>
          ))}
        </article>
      </section>

      <h2>results.csv</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t('Баған', 'Столбец')}</th>
              <th>{t('Мазмұны', 'Содержание')}</th>
              <th>{t('Міндетті', 'Обязательно')}</th>
            </tr>
          </thead>
          <tbody>
            {RESULT_COLS.map((col) => (
              <tr key={col}>
                <td>
                  <code>{col}</code>
                </td>
                <td>{lang === 'kk' ? desc[col][0] : desc[col][1]}</td>
                <td>{desc[col][2] ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">
        {t('Бір жол — бір оқушының бір тақырыптағы нәтижесі.', 'Одна строка — результат одного ученика по одной теме.')} <code>curriculum.csv</code>: {CURRICULUM_COLS.join(', ')}{' '}
        {t('(тірек тақырыптар «;» арқылы). Оқу жоспары берілмесе, жоспарлы сағат сыныптардағы медианадан алынады.', '(опорные темы через «;»). Без учебного плана плановые часы берутся как медиана по классам.')}
      </p>

      <h2>{t('Әдістеме қысқаша', 'Методика кратко')}</h2>
      <ul className="method">
        <li>
          <b>{t('Тақырыптар.', 'Темы.')}</b>{' '}
          {t(
            `Меңгеру үлесі — ${PASS}+ балл алғандар. «Қиын» < ${HARD}%, «назарда» ${HARD}–${WATCH}%. 95% сенім аралығы сынып топтарын қайта іріктеу (кластерлік бутстрэп) арқылы есептеледі, себебі бір сыныптың оқушылары тәуелсіз емес. Тірек тақырыппен байланыс бастапқы деңгейді есептен шығарған соң бағаланады.`,
            `Доля усвоивших — набравшие ${PASS}+ баллов. «Сложная» < ${HARD}%, «в зоне риска» ${HARD}–${WATCH}%. 95% доверительный интервал считается перевыборкой классов (кластерный бутстрэп), так как ученики одного класса не независимы. Связь с опорной темой оценивается после исключения входного уровня.`,
          )}
        </li>
        <li>
          <b>{t('Оқулықтар.', 'Учебники.')}</b>{' '}
          {t(
            'Регрессия: балл ~ оқулық + бастапқы диагностика + қала/ауыл + оқыту тілі; стандарт қателер мектеп бойынша кластерленген. Қарапайым айырма мен түзетілген әсер қатар көрсетіледі, қорытындылары қарама-қарсы болса, ескерту шығады.',
            'Регрессия: балл ~ учебник + входная диагностика + город/село + язык обучения; стандартные ошибки кластеризованы по школам. Простая разница и эффект с поправкой показаны рядом; если выводы противоположны, выводится предупреждение.',
          )}
        </li>
        <li>
          <b>{t('Сағаттар.', 'Часы.')}</b>{' '}
          {t(
            'Әр тақырып бойынша: сынып балы ~ ln(нақты сағат) + бастапқы деңгей + қала/ауыл. Шулы бағалар ортақ мәнге қарай сығылады (эмпирикалық Байес). Сағат бір-бірлеп ең пайдалы жерге жылжытылады, жылдық сома сақталады, шек ±30%.',
            'По каждой теме: балл класса ~ ln(фактические часы) + входной уровень + город/село. Шумные оценки сжимаются к общему значению (эмпирический Байес). Часы переносятся по одному туда, где польза максимальна; годовой объём сохраняется, предел ±30%.',
          )}
        </li>
        <li>
          <b>{t('Сақтық.', 'Осторожность.')}</b>{' '}
          {t(
            `Тақырыпқа ${MIN_STUDENTS} оқушыдан немесе ${MIN_UNITS} сынып тобынан аз болса, қорытынды жасалмайды. Бастапқы деңгей болмаса, оқулық айырмасы «дәлелденбеген» деп көрсетіледі.`,
            `Если по теме меньше ${MIN_STUDENTS} учеников или ${MIN_UNITS} классов, вывод не делается. Без входного уровня разница учебников показывается как «не доказана».`,
          )}
        </li>
      </ul>
    </>
  );
}
