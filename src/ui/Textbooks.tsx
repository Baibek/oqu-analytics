import { useMemo } from 'react';
import { MIN_STUDENTS, MIN_UNITS, textbooksBySection } from '../lib/analysis';
import { Ctx, fmt, glossary, Hint, Icon, Note, PageHead, Pill, ScopeNote, signed, verdictLabel } from './common';

const pillOf = { ref: 'nodata', better: 'ok', worse: 'hard', unproven: 'watch', nodata: 'nodata' } as const;

export function Textbooks({ c, setRefBook }: { c: Ctx; setRefBook: (s: string) => void }) {
  const { t, lang } = c;
  const ds = c.region;
  const mine = c.scope.unit !== null ? c.region.units[c.scope.unit]?.textbook : c.scope.school ? c.region.units.find((u) => u.school === c.scope.school)?.textbook : undefined;
  const g = glossary(t);
  const tb = c.textbooks;
  const refBook = tb?.ref ?? '';
  const sections = useMemo(() => textbooksBySection(ds, lang, refBook || undefined), [ds, lang, refBook]);

  const head = (tools?: JSX.Element) => (
    <PageHead
      title={t('Оқулықтарды салыстыру', 'Сравнение учебников')}
      question={t(
        'Қай оқулықпен оқыған оқушылар жақсы нәтиже көрсетеді? Оқулықты мектеп таңдайды, сондықтан біз бастапқы деңгейі мен жағдайы бірдей оқушыларды салыстырамыз — мектептерді емес, оқулықтарды.',
        'С каким учебником ученики показывают лучший результат? Учебник выбирает школа, поэтому мы сравниваем учеников с одинаковым входным уровнем и условиями — учебники, а не школы.',
      )}
    >
      {tools}
    </PageHead>
  );

  if (!tb || !tb.ref) {
    return (
      <>
        {head()}
        <Note kind="warn">
          {t(
            `Оқулықтарды салыстыруға дерек жеткіліксіз: әр оқулыққа кемінде ${MIN_STUDENTS} оқушы мен ${MIN_UNITS} сынып тобы керек.`,
            `Недостаточно данных для сравнения учебников: на каждый учебник нужно не менее ${MIN_STUDENTS} учеников и ${MIN_UNITS} классов.`,
          )}
        </Note>
      </>
    );
  }

  const others = tb.rows.filter((r) => r.verdict !== 'ref');
  const better = others.filter((r) => r.verdict === 'better');
  const worse = others.filter((r) => r.verdict === 'worse');
  const unproven = others.filter((r) => r.verdict === 'unproven');
  const nodata = others.filter((r) => r.verdict === 'nodata');
  const cmp = others.filter((r) => r.adj !== null);
  const span = Math.max(4, ...cmp.flatMap((r) => [Math.abs(r.lo!), Math.abs(r.hi!), Math.abs(r.naive!)])) * 1.1;
  const pos = (v: number) => Math.min(100, Math.max(0, 50 + (v / span) * 50));
  const ctrl = { baseline: t('бастапқы диагностика балы', 'балл входной диагностики'), urban: t('қала/ауыл', 'город/село'), lang: t('оқыту тілі', 'язык обучения') };
  const flipped = tb.rows.find((r) => r.flipped);

  const parts: string[] = [];
  if (better.length) parts.push(t(`${better.map((r) => r.name).join(', ')} — мәнді жоғары`, `${better.map((r) => r.name).join(', ')} — значимо выше`));
  if (worse.length) parts.push(t(`${worse.map((r) => r.name).join(', ')} — мәнді төмен`, `${worse.map((r) => r.name).join(', ')} — значимо ниже`));
  if (unproven.length) parts.push(t(`${unproven.map((r) => r.name).join(', ')} — айырма дәлелденбеген`, `${unproven.map((r) => r.name).join(', ')} — разница не доказана`));
  if (nodata.length) parts.push(t(`${nodata.map((r) => r.name).join(', ')} — дерек жеткіліксіз`, `${nodata.map((r) => r.name).join(', ')} — мало данных`));

  return (
    <>
      {head(
        <label className="field">
          {t('Салыстыру негізі', 'База сравнения')}
          <select value={tb.ref} onChange={(e) => setRefBook(e.target.value)}>
            {tb.rows
              .filter((r) => r.verdict !== 'nodata')
              .map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
          </select>
        </label>,
      )}

      <ScopeNote c={c} what="textbooks" />

      <div className="card verdict">
        <span className="badge">
          <Icon name={better.length || worse.length ? 'check' : 'info'} size={20} />
        </span>
        <div>
          <p className="headline">{t(`${tb.ref}-мен салыстырғанда: `, `По сравнению с ${tb.ref}: `) + parts.join('; ') + '.'}</p>
          <p>
            {t('Түзету факторлары:', 'Поправка на:')} {tb.controls.map((x) => ctrl[x]).join(', ') || '—'}.{' '}
            {t('Стандарт қателер мектеп деңгейінде кластерленген.', 'Стандартные ошибки кластеризованы по школам.')}
          </p>
        </div>
      </div>

      {!ds.hasBaseline && (
        <Note kind="warn">
          {t(
            'Деректе оқушылардың бастапқы деңгейі (baseline) жоқ. Онсыз айырмашылықты оқулыққа таңуға болмайды, сондықтан барлық қорытынды «дәлелденбеген» деп көрсетіледі.',
            'В данных нет входного уровня учеников (baseline). Без него разницу нельзя приписать учебнику, поэтому все выводы показаны как «не доказано».',
          )}
        </Note>
      )}

      {flipped && (
        <div className="compare">
          <div className="card side wrong">
            <div className="lbl">
              {t('Қарапайым салыстыру', 'Простое сравнение')}
              <Hint text={g.naive} />
            </div>
            <div className="big">
              {signed(flipped.naive)} {t('балл', 'балла')}
            </div>
            <p>{t(`${flipped.name} орташа баллы ${tb.ref}-дан ${flipped.naive! < 0 ? 'төмен' : 'жоғары'} — бірақ бұл мектептер құрамының айырмасы.`, `Средний балл ${flipped.name} ${flipped.naive! < 0 ? 'ниже' : 'выше'}, чем у ${tb.ref}, — но это разница в составе школ.`)}</p>
          </div>
          <div className="vs" aria-hidden="true">
            <Icon name="arrow" size={22} />
          </div>
          <div className="card side right">
            <div className="lbl">
              {t('Түзетілген салыстыру', 'Сравнение с поправкой')}
              <Hint text={g.adjusted} />
            </div>
            <div className={`big ${flipped.adj! > 0 ? 'c-ok' : 'c-hard'}`}>
              {signed(flipped.adj)} {t('балл', 'балла')}
            </div>
            <p>
              {t('Бастапқы деңгейі мен жағдайы бірдей оқушыларда', 'У учеников с одинаковым входным уровнем и условиями')} · 95% {t('СА', 'ДИ')} {signed(flipped.lo)}…{signed(flipped.hi)}
            </p>
          </div>
        </div>
      )}

      <div className="card tablecard">
        <table>
          <thead>
            <tr>
              <th>{t('Оқулық', 'Учебник')}</th>
              <th className="num">{t('Оқушы', 'Учеников')}</th>
              <th className="num">{t('Сынып', 'Классов')}</th>
              <th className="num">{t('Орташа балл', 'Средний балл')}</th>
              <th className="num">
                {t('Қарапайым', 'Простая')}
                <Hint text={g.naive} />
              </th>
              <th className="num">
                {t('Түзетілген', 'С поправкой')}
                <Hint text={g.adjusted} />
              </th>
              <th className="forest-h">
                <div className="ax">
                  <span>−{fmt(span)}</span>
                  <span>0</span>
                  <span>+{fmt(span)}</span>
                </div>
              </th>
              <th>{t('Қорытынды', 'Вывод')}</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.name} className={r.name === mine ? 'mine' : ''}>
                <td>
                  <b>{r.name}</b>
                  {r.name === mine && <small className="muted block">{t('таңдалған сынып', 'выбранный класс')}</small>}
                </td>
                <td className="num">{r.n}</td>
                <td className="num">{r.units}</td>
                <td className="num">{fmt(r.rawMean, 1)}</td>
                <td className="num muted">{r.verdict === 'ref' || r.naive === null ? '—' : signed(r.naive)}</td>
                <td className="num">
                  {r.verdict === 'ref' || r.adj === null ? (
                    '—'
                  ) : (
                    <>
                      <b>{signed(r.adj)}</b>
                      <small>
                        {signed(r.lo)}…{signed(r.hi)}
                      </small>
                      <small>
                        {signed(r.sdUnits, 2)} SD · p {r.p! < 0.001 ? '< 0,001' : `= ${fmt(r.p, 3)}`}
                      </small>
                    </>
                  )}
                </td>
                <td>
                  <div className="forest" aria-hidden="true">
                    <i className="zero" />
                    {r.adj !== null && r.verdict !== 'ref' && (
                      <>
                        <i className={`range r-${r.verdict}`} style={{ left: `${pos(r.lo!)}%`, width: `${pos(r.hi!) - pos(r.lo!)}%` }} />
                        <i className="naive" style={{ left: `${pos(r.naive!)}%` }} />
                        <i className={`pt r-${r.verdict}`} style={{ left: `${pos(r.adj)}%` }} />
                      </>
                    )}
                  </div>
                </td>
                <td>
                  <Pill kind={pillOf[r.verdict]}>{verdictLabel(r.verdict, t)}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span>
          <i className="k-naive" /> {t('қарапайым айырма', 'простая разница')}
        </span>
        <span>
          <i className="k-adj" /> {t('түзетілген әсер және 95% сенім аралығы', 'эффект с поправкой и 95% доверительный интервал')}
        </span>
        <span>
          SD <Hint text={g.sd} />
        </span>
        <span>
          p <Hint text={g.p} />
        </span>
      </div>

      <h2>{t('Бөлімдер бойынша: оқулықтың қай бөлімі күшті?', 'По разделам: какой раздел учебника сильнее?')}</h2>
      <div className="card tablecard">
        <table>
          <thead>
            <tr>
              <th>{t('Бөлім', 'Раздел')}</th>
              {others.map((r) => (
                <th key={r.name} className="num">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.section}>
                <td>{s.section}</td>
                {others.map((r) => {
                  const cell = s.rows.find((x) => x.name === r.name);
                  if (!cell || cell.adj === null)
                    return (
                      <td key={r.name} className="num muted">
                        {t('дерек аз', 'мало данных')}
                      </td>
                    );
                  const sig = cell.verdict === 'better' || cell.verdict === 'worse';
                  return (
                    <td key={r.name} className={`num ${sig ? (cell.verdict === 'better' ? 'cell-ok' : 'cell-hard') : 'muted'}`}>
                      {sig ? <b>{signed(cell.adj)}</b> : signed(cell.adj)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">
        {t(
          `Мәндер — ${tb.ref}-ға қатысты түзетілген айырма, балл. Боялған ұяшықтар статистикалық мәнді (p < 0,05); сұр мәндер кездейсоқ ауытқудан ажыратылмайды. Бірнеше бөлімді қатар тексергенде бір-екі «мәнді» ұяшық кездейсоқ шығуы мүмкін.`,
          `Значения — разница с поправкой относительно ${tb.ref}, в баллах. Закрашенные ячейки статистически значимы (p < 0,05); серые значения неотличимы от случайных колебаний. При проверке нескольких разделов одна-две «значимые» ячейки могут появиться случайно.`,
        )}
      </p>

      <Note>
        {t(
          'Нені есте ұстау керек: халықаралық зерттеулерде оқулықтар арасындағы айырма әдетте шағын (шамамен 0,03–0,08 SD). Дерек бақылаулық, сондықтан мұғалім біліктілігі сияқты есепке алынбаған факторлар әсер етуі мүмкін. Оқулықты ауыстыру туралы шешімді алдымен бірнеше мектептегі сынақпен растаған жөн.',
          'Что важно помнить: в международных исследованиях разница между учебниками обычно мала (около 0,03–0,08 SD). Данные наблюдательные, поэтому могут влиять неучтённые факторы, например квалификация учителя. Решение о смене учебника стоит сначала подтвердить пилотом в нескольких школах.',
        )}
        {ds.synthetic && ' ' + t('Демо дерегінде айырма көрнекілік үшін әдейі үлкен салынған.', 'В демо-данных разница намеренно заложена крупной для наглядности.')}
      </Note>
    </>
  );
}
