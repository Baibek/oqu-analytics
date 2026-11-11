import { useState } from 'react';
import { CURRICULUM_COLS, download, exportCurriculum, exportResults, ImportedCourse, ImportIssue, importCatalog, RESULT_COLS } from '../lib/csv';
import { HARD, MIN_STUDENTS, MIN_UNITS, PASS, WATCH } from '../lib/analysis';
import { generateDemo } from '../lib/generate';
import { Ctx, Icon, Note, PageHead, TFn } from './common';

function Drop({ label, hint, file, onFile, t }: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void; t: TFn }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`drop ${over ? 'over' : ''} ${file ? 'has' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <span className="ic">
        <Icon name={file ? 'check' : 'upload'} size={20} />
      </span>
      <span>
        <b>{file ? file.name : label}</b>
        <small>{file ? `${(file.size / 1024).toFixed(0)} KB · ${t('басқа файл таңдау үшін басыңыз', 'нажмите, чтобы выбрать другой файл')}` : hint}</small>
      </span>
      <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  );
}

export function DataPage({ c, synthetic, onLoad, onReset }: { c: Ctx; synthetic: boolean; onLoad: (courses: ImportedCourse[]) => void; onReset: () => void }) {
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
    const r = importCatalog(await results.text(), plan ? await plan.text() : undefined, results.name);
    setIssues(r.issues);
    if (r.courses.length) {
      onLoad(r.courses);
      const students = r.courses.reduce((a, x) => a + x.ds.students.length, 0);
      const schools = new Set(r.courses.flatMap((x) => x.ds.units.map((u) => u.school))).size;
      setLoaded(`${r.courses.length} ${t('курс (пән × параллель)', 'курс(ов) (предмет × параллель)')}, ${students} ${t('оқушы нәтижесі', 'результатов учеников')}, ${schools} ${t('мектеп', 'школ')}`);
    } else setLoaded('');
  };

  const sample = generateDemo();
  const desc: Record<string, [string, string, boolean]> = {
    subject: ['Пән (мысалы, Алгебра). Бір файлда бірнеше пән болуы мүмкін', 'Предмет (например, Алгебра). В одном файле может быть несколько предметов', false],
    grade: ['Параллель: 7, 8, 9…', 'Параллель: 7, 8, 9…', false],
    class: ['Сынып атауы: 8А, 8Ә…', 'Название класса: 8А, 8Ә…', false],
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
      <PageHead
        title={t('Дерек', 'Данные')}
        question={t(
          'Өз мектептеріңіздің нәтижесін талдағыңыз келе ме? CSV файлын жүктеңіз: ол браузерде өңделеді және ешқайда жіберілмейді.',
          'Хотите проанализировать результаты своих школ? Загрузите CSV-файл: он обрабатывается в браузере и никуда не отправляется.',
        )}
      />

      <section className="grid2">
        <article className="card pad">
          <div className="stephead">
            <span className="n">1</span>
            <h3>{t('Үлгіні жүктеп алыңыз', 'Скачайте шаблон')}</h3>
          </div>
          <p className="small">
            {t(
              'Үлгілер демо дерегінен жасалған: форматты көру үшін ашып қараңыз. Excel-де «CSV UTF-8» ретінде сақтаңыз; үтір де, нүктелі үтір де қабылданады.',
              'Шаблоны собраны из демо-данных: откройте, чтобы увидеть формат. В Excel сохраняйте как «CSV UTF-8»; подходит и запятая, и точка с запятой.',
            )}
          </p>
          <div className="actions">
            <button className="btn" onClick={() => download('results-template.csv', exportResults(sample, lang, 2))}>
              <Icon name="download" size={16} /> results.csv
            </button>
            <button className="btn" onClick={() => download('curriculum-template.csv', exportCurriculum(sample, lang))}>
              <Icon name="download" size={16} /> curriculum.csv
            </button>
          </div>
        </article>

        <article className="card pad">
          <div className="stephead">
            <span className="n">2</span>
            <h3>{t('Файлдарды жүктеңіз', 'Загрузите файлы')}</h3>
          </div>
          <Drop
            t={t}
            file={results}
            onFile={setResults}
            label={t('Нәтижелер — results.csv', 'Результаты — results.csv')}
            hint={t('Міндетті · файлды осында сүйреңіз немесе басып таңдаңыз', 'Обязательно · перетащите файл сюда или нажмите')}
          />
          <Drop
            t={t}
            file={plan}
            onFile={setPlan}
            label={t('Оқу жоспары — curriculum.csv', 'Учебный план — curriculum.csv')}
            hint={t('Міндетті емес · жоспарлы сағат пен тірек тақырыптар', 'Необязательно · плановые часы и опорные темы')}
          />
          <div className="actions">
            <button className="btn primary" disabled={!results} onClick={run}>
              <Icon name="sparkle" size={16} />
              {t('Жүктеу және талдау', 'Загрузить и проанализировать')}
            </button>
            {!synthetic && (
              <button className="btn" onClick={onReset}>
                <Icon name="reset" size={16} />
                {t('Демо дерекке қайту', 'Вернуться к демо')}
              </button>
            )}
          </div>
          {loaded && (
            <Note>
              {t('Жүктелді: ', 'Загружено: ') + loaded}.{' '}
              <button className="btn ghost sm" onClick={() => c.go('overview')}>
                {t('Шолуды ашу', 'Открыть обзор')} <Icon name="arrow" size={14} />
              </button>
            </Note>
          )}
          {issues.map((i, k) => (
            <Note key={k} kind="warn">
              {issueText(i)}
            </Note>
          ))}
        </article>
      </section>

      <h2>{t('results.csv форматы', 'Формат results.csv')}</h2>
      <div className="card tablecard">
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
                <td>{desc[col][2] ? <Icon name="check" size={16} /> : <span className="muted">—</span>}</td>
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
      <div className="method">
        <div className="card">
          <h3>{t('Тақырыптар', 'Темы')}</h3>
          <p>
            {t(
              `Меңгеру үлесі — ${PASS}+ балл алғандар. «Қиын» < ${HARD}%, «назарда» ${HARD}–${WATCH}%. 95% сенім аралығы сынып топтарын қайта іріктеу (кластерлік бутстрэп) арқылы есептеледі. Тірек тақырыппен байланыс бастапқы деңгейді шығарған соң бағаланады.`,
              `Доля усвоивших — набравшие ${PASS}+ баллов. «Сложная» < ${HARD}%, «в зоне риска» ${HARD}–${WATCH}%. 95% доверительный интервал — перевыборка классов (кластерный бутстрэп). Связь с опорной темой оценивается после исключения входного уровня.`,
            )}
          </p>
        </div>
        <div className="card">
          <h3>{t('Оқулықтар', 'Учебники')}</h3>
          <p>
            {t(
              'Регрессия: балл ~ оқулық + бастапқы диагностика + қала/ауыл + оқыту тілі; стандарт қателер мектеп бойынша кластерленген. Қарапайым айырма мен түзетілген әсер қатар көрсетіледі.',
              'Регрессия: балл ~ учебник + входная диагностика + город/село + язык обучения; стандартные ошибки кластеризованы по школам. Простая разница и эффект с поправкой показаны рядом.',
            )}
          </p>
        </div>
        <div className="card">
          <h3>{t('Сағаттар', 'Часы')}</h3>
          <p>
            {t(
              'Әр тақырып: сынып балы ~ ln(нақты сағат) + бастапқы деңгей + қала/ауыл. Шулы бағалар ортақ мәнге сығылады (эмпирикалық Байес). Сағат ең пайдалы жерге жылжытылады, жылдық сома сақталады, шек ±30%.',
              'По каждой теме: балл класса ~ ln(фактические часы) + входной уровень + город/село. Шумные оценки сжимаются к общему значению (эмпирический Байес). Часы переносятся туда, где польза максимальна; годовой объём сохраняется, предел ±30%.',
            )}
          </p>
        </div>
        <div className="card">
          <h3>{t('Сақтық', 'Осторожность')}</h3>
          <p>
            {t(
              `Тақырыпқа ${MIN_STUDENTS} оқушыдан немесе ${MIN_UNITS} сынып тобынан аз болса, қорытынды жасалмайды. Бастапқы деңгей болмаса, оқулық айырмасы «дәлелденбеген» деп көрсетіледі.`,
              `Если по теме меньше ${MIN_STUDENTS} учеников или ${MIN_UNITS} классов, вывод не делается. Без входного уровня разница учебников показывается как «не доказана».`,
            )}
          </p>
        </div>
      </div>
    </>
  );
}
