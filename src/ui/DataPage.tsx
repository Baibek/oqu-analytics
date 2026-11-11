import { useState } from 'react';
import { CURRICULUM_COLS, download, exportCurriculum, exportResults, ImportedCourse, ImportIssue, importCatalog, parseCsv, RESULT_COLS, toCsv } from '../lib/csv';
import { pickSheets, readXlsx, writeXlsx } from '../lib/xlsx';
import { HARD, MIN_STUDENTS, MIN_UNITS, PASS, WATCH } from '../lib/analysis';
import { generateDemo } from '../lib/generate';
import { Ctx, Icon, Note, PageHead, TFn } from './common';

const isExcel = (f: File) => /\.xlsx?$/i.test(f.name);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** CSV мәтінін Excel жолдарына айналдыру: сандар Excel-де сан болып қалады */
const csvToSheet = (csv: string) => parseCsv(csv).map((r, i) => (i ? r.map((v) => (v !== '' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)) : r));

function downloadBytes(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
      <input type="file" accept={`.xlsx,.xls,.csv,text/csv,${XLSX_MIME},application/vnd.ms-excel`} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  );
}

export function DataPage({ c, synthetic, onLoad, onReset }: { c: Ctx; synthetic: boolean; onLoad: (courses: ImportedCourse[]) => void; onReset: () => void }) {
  const { t, lang } = c;
  const [results, setResults] = useState<File | null>(null);
  const [plan, setPlan] = useState<File | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [loaded, setLoaded] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');

  const issueText = (i: ImportIssue) =>
    ({
      missing_cols: t(`Міндетті бағандар жоқ: ${i.detail}`, `Нет обязательных столбцов: ${i.detail}`),
      bad_score: t(`${i.detail} жол өткізілді: балл бос немесе 0–100 аралығынан тыс`, `Пропущено строк: ${i.detail} — балл пустой или вне диапазона 0–100`),
      no_rows: t('Жарамды жол табылмады', 'Не найдено ни одной корректной строки'),
      unknown_topic: t(`Оқу жоспарында жоқ тақырыптар өткізілді: ${i.detail}`, `Пропущены темы, которых нет в учебном плане: ${i.detail}`),
      bad_hours: t(`Жоспарлы сағат дұрыс емес: ${i.detail}`, `Некорректные плановые часы: ${i.detail}`),
    })[i.code];

  const fileErrorText = (code: string) =>
    ({
      xls_legacy: t('Ескі .xls форматы қолдау таппайды. Excel-де «Файл → Басқаша сақтау → Excel кітабы (.xlsx)» таңдаңыз немесе CSV ретінде сақтаңыз.', 'Старый формат .xls не поддерживается. В Excel выберите «Файл → Сохранить как → Книга Excel (.xlsx)» или сохраните как CSV.'),
      no_results_sheet: t('Excel файлынан нәтижелер парағы табылмады: парақ «Нәтижелер» деп аталуы немесе бірінші жолында score бағаны болуы керек.', 'В Excel-файле не найден лист с результатами: назовите его «Результаты» или добавьте столбец score в первую строку.'),
    })[code] ?? t('Файлды оқу мүмкін болмады. Ол бүлінген болуы мүмкін: Excel-де қайта сақтап көріңіз.', 'Не удалось прочитать файл. Возможно, он повреждён: попробуйте пересохранить его в Excel.');

  /** Нәтижелер мен жоспардың CSV мәтінін алу: Excel болса, парақтарын тауып CSV-ге айналдырамыз */
  const readInputs = async (): Promise<{ resultsCsv: string; planCsv?: string }> => {
    let resultsCsv: string;
    let planCsv: string | undefined;
    if (isExcel(results!)) {
      const { results: rs, plan: ps } = pickSheets(await readXlsx(await results!.arrayBuffer()));
      if (!rs) throw new Error('no_results_sheet');
      resultsCsv = toCsv(rs.rows);
      if (ps) planCsv = toCsv(ps.rows);
    } else resultsCsv = await results!.text();
    if (plan) {
      if (isExcel(plan)) {
        const sheets = await readXlsx(await plan.arrayBuffer());
        const ps = pickSheets(sheets).plan ?? sheets[0];
        if (ps) planCsv = toCsv(ps.rows);
      } else planCsv = await plan.text();
    }
    return { resultsCsv, planCsv };
  };

  const run = async () => {
    if (!results) return;
    setBusy(true);
    setFileError('');
    // Батырма «өңделуде» күйін көрсетіп үлгеруі үшін
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { resultsCsv, planCsv } = await readInputs();
      const r = importCatalog(resultsCsv, planCsv, results.name.replace(/\.(xlsx?|csv)$/i, ''));
      setIssues(r.issues);
      if (r.courses.length) {
        onLoad(r.courses);
        const students = r.courses.reduce((a, x) => a + x.ds.students.length, 0);
        const schools = new Set(r.courses.flatMap((x) => x.ds.units.map((u) => u.school))).size;
        setLoaded(`${r.courses.length} ${t('курс (пән × параллель)', 'курс(ов) (предмет × параллель)')}, ${students} ${t('оқушы нәтижесі', 'результатов учеников')}, ${schools} ${t('мектеп', 'школ')}`);
      } else setLoaded('');
    } catch (e) {
      setIssues([]);
      setLoaded('');
      setFileError(fileErrorText(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const excelTemplate = () => {
    const bytes = writeXlsx([
      { name: t('Нәтижелер', 'Результаты'), rows: csvToSheet(exportResults(sample, lang, 2)) },
      { name: t('Оқу жоспары', 'Учебный план'), rows: csvToSheet(exportCurriculum(sample, lang)) },
    ]);
    downloadBytes('oqu-analytics-template.xlsx', bytes, XLSX_MIME);
    c.notify(t('Excel үлгісі жүктелді', 'Шаблон Excel скачан'));
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
    program: ['Оқу бағдарламасы (мысалы, қолданыстағы / пилоттық). Міндетті емес', 'Учебная программа (например, действующая / пилотная). Необязательно', false],
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
          'Өз мектептеріңіздің нәтижесін талдағыңыз келе ме? Excel (.xlsx) немесе CSV файлын жүктеңіз: ол браузерде өңделеді және ешқайда жіберілмейді.',
          'Хотите проанализировать результаты своих школ? Загрузите файл Excel (.xlsx) или CSV: он обрабатывается в браузере и никуда не отправляется.',
        )}
      />

      <section className="grid2">
        <article className="card pad">
          <div className="stephead">
            <span className="n">1</span>
            <h2 className="h3">{t('Үлгіні жүктеп алыңыз', 'Скачайте шаблон')}</h2>
          </div>
          <p className="small">
            {t(
              'Үлгі демо дерегінен жасалған: форматты көру үшін ашып қараңыз. Excel үлгісінде екі парақ бар: «Нәтижелер» және «Оқу жоспары». CSV-ді де қолдануға болады (UTF-8, үтір немесе нүктелі үтір).',
              'Шаблон собран из демо-данных: откройте, чтобы увидеть формат. В шаблоне Excel два листа: «Результаты» и «Учебный план». Можно использовать и CSV (UTF-8, запятая или точка с запятой).',
            )}
          </p>
          <div className="actions">
            <button className="btn primary" onClick={excelTemplate}>
              <Icon name="download" size={16} /> {t('Excel үлгісі (.xlsx)', 'Шаблон Excel (.xlsx)')}
            </button>
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
            <h2 className="h3">{t('Файлдарды жүктеңіз', 'Загрузите файлы')}</h2>
          </div>
          <Drop
            t={t}
            file={results}
            onFile={setResults}
            label={t('Нәтижелер — Excel (.xlsx) немесе CSV', 'Результаты — Excel (.xlsx) или CSV')}
            hint={t('Міндетті · файлды сүйреңіз немесе басып таңдаңыз. Excel-де «Оқу жоспары» парағы болса, екінші файл керек емес', 'Обязательно · перетащите файл или нажмите. Если в Excel есть лист «Учебный план», второй файл не нужен')}
          />
          <Drop
            t={t}
            file={plan}
            onFile={setPlan}
            label={t('Оқу жоспары — Excel (.xlsx) немесе CSV', 'Учебный план — Excel (.xlsx) или CSV')}
            hint={t('Міндетті емес · жоспарлы сағат пен тірек тақырыптар', 'Необязательно · плановые часы и опорные темы')}
          />
          <div className="actions">
            <button className="btn primary" disabled={!results || busy} aria-busy={busy} onClick={run}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkle" size={16} />}
              {busy ? t('Өңделуде…', 'Обработка…') : t('Жүктеу және талдау', 'Загрузить и проанализировать')}
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
          {fileError && <Note kind="warn">{fileError}</Note>}
          {issues.map((i, k) => (
            <Note key={k} kind="warn">
              {issueText(i)}
            </Note>
          ))}
        </article>
      </section>

      <h2>{t('«Нәтижелер» парағының (results.csv) форматы', 'Формат листа «Результаты» (results.csv)')}</h2>
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
