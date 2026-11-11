import { useMemo } from 'react';
import { MIN_STUDENTS, MIN_UNITS, textbooksBySection } from '../lib/analysis';
import { Ctx, fmt, Note, Pill, signed, verdictLabel } from './common';

const pillOf = { ref: 'nodata', better: 'ok', worse: 'hard', unproven: 'watch', nodata: 'nodata' } as const;

export function Textbooks({ c, refBook, setRefBook }: { c: Ctx; refBook: string; setRefBook: (s: string) => void }) {
  const { t, ds, lang } = c;
  const tb = c.textbooks;
  const sections = useMemo(() => textbooksBySection(ds, lang, refBook || undefined), [ds, lang, refBook]);

  if (!tb || !tb.ref) {
    return (
      <Note kind="warn">
        {t(
          `Оқулықтарды салыстыруға дерек жеткіліксіз: әр оқулыққа кемінде ${MIN_STUDENTS} оқушы мен ${MIN_UNITS} сынып тобы керек.`,
          `Недостаточно данных для сравнения учебников: на каждый учебник нужно не менее ${MIN_STUDENTS} учеников и ${MIN_UNITS} классов.`,
        )}
      </Note>
    );
  }

  const cmp = tb.rows.filter((r) => r.adj !== null && r.verdict !== 'ref');
  const span = Math.max(4, ...cmp.flatMap((r) => [Math.abs(r.lo!), Math.abs(r.hi!), Math.abs(r.naive!)])) * 1.1;
  const pos = (v: number) => 50 + (v / span) * 50;
  const ctrl = { baseline: t('бастапқы диагностика балы', 'балл входной диагностики'), urban: t('қала/ауыл', 'город/село'), lang: t('оқыту тілі', 'язык обучения') };
  const flipped = tb.rows.find((r) => r.flipped);

  return (
    <>
      <div className="head">
        <div>
          <h1>{t('Оқулықтарды салыстыру', 'Сравнение учебников')}</h1>
          <p className="lead">
            {t(
              'Оқулықты мектеп таңдайды, ал мықты мектептер басқаша таңдауы мүмкін. Сондықтан орташа баллды тікелей салыстыру оқулықты емес, мектептерді салыстырады. Біз екі көріністі қатар көрсетеміз.',
              'Учебник выбирает школа, и сильные школы могут выбирать иначе. Поэтому прямое сравнение средних баллов сравнивает школы, а не учебники. Мы показываем обе картины рядом.',
            )}
          </p>
        </div>
        <label className="pick">
          {t('Салыстыру негізі', 'База сравнения')}
          <select value={tb.ref} onChange={(e) => setRefBook(e.target.value)}>
            {tb.rows
              .filter((r) => r.verdict !== 'nodata')
              .map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
          </select>
        </label>
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
        <Note kind="warn">
          <b>{t('Қарапайым салыстыру қате қорытындыға әкеледі. ', 'Простое сравнение ведёт к ошибочному выводу. ')}</b>
          {t(
            `Орташа балл бойынша ${flipped.name} ${tb.ref}-дан ${fmt(Math.abs(flipped.naive!), 1)} балл ${flipped.naive! < 0 ? 'төмен' : 'жоғары'}. Бірақ бастапқы деңгейі мен жағдайы бірдей оқушыларды салыстырғанда ол ${fmt(Math.abs(flipped.adj!), 1)} балл ${flipped.adj! > 0 ? 'жоғары' : 'төмен'} нәтиже береді.`,
            `По средним баллам ${flipped.name} на ${fmt(Math.abs(flipped.naive!), 1)} балла ${flipped.naive! < 0 ? 'ниже' : 'выше'}, чем ${tb.ref}. Но при сравнении учеников с одинаковым входным уровнем и условиями он даёт результат на ${fmt(Math.abs(flipped.adj!), 1)} балла ${flipped.adj! > 0 ? 'выше' : 'ниже'}.`,
          )}
        </Note>
      )}

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t('Оқулық', 'Учебник')}</th>
              <th className="num">{t('Оқушы', 'Учеников')}</th>
              <th className="num">{t('Сынып тобы', 'Классов')}</th>
              <th className="num">{t('Орташа балл', 'Средний балл')}</th>
              <th className="num">{t('Қарапайым айырма', 'Простая разница')}</th>
              <th className="num">{t('Түзетілген әсер (95% СА)', 'Эффект с поправкой (95% ДИ)')}</th>
              <th className="forest-h">
                <span>−{fmt(span)}</span>
                <span>0</span>
                <span>+{fmt(span)}</span>
              </th>
              <th>{t('Қорытынды', 'Вывод')}</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.name}>
                <td>
                  <b>{r.name}</b>
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
                      <b>{signed(r.adj)}</b>{' '}
                      <small>
                        ({signed(r.lo)}…{signed(r.hi)})
                      </small>
                      <br />
                      <small className="muted">
                        {signed(r.sdUnits, 2)} SD · p = {r.p! < 0.001 ? '<0,001' : fmt(r.p, 3)}
                      </small>
                    </>
                  )}
                </td>
                <td>
                  <div className="forest" aria-hidden="true">
                    <i className="zero" />
                    {r.adj !== null && r.verdict !== 'ref' && (
                      <>
                        <i className="naive" style={{ left: `${pos(r.naive!)}%` }} />
                        <i className={`range r-${r.verdict}`} style={{ left: `${pos(r.lo!)}%`, width: `${pos(r.hi!) - pos(r.lo!)}%` }} />
                        <i className={`dot r-${r.verdict}`} style={{ left: `${pos(r.adj)}%` }} />
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
      <p className="small">
        <span className="key key-naive" /> {t('қарапайым айырма', 'простая разница')} &nbsp; <span className="key key-adj" /> {t('түзетілген әсер және 95% сенім аралығы', 'эффект с поправкой и 95% доверительный интервал')}.{' '}
        {t('Түзету факторлары:', 'Поправка на:')} {tb.controls.map((x) => ctrl[x]).join(', ') || '—'}. {t('Стандарт қателер мектеп деңгейінде кластерленген.', 'Стандартные ошибки кластеризованы по школам.')}
      </p>

      <h2>{t('Бөлімдер бойынша: оқулықтың қай бөлімі күшті?', 'По разделам: какой раздел учебника сильнее?')}</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t('Бөлім', 'Раздел')}</th>
              {tb.rows
                .filter((r) => r.verdict !== 'ref')
                .map((r) => (
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
                {tb.rows
                  .filter((r) => r.verdict !== 'ref')
                  .map((r) => {
                    const cell = s.rows.find((x) => x.name === r.name);
                    if (!cell || cell.adj === null) return <td key={r.name} className="num muted">{t('дерек аз', 'мало данных')}</td>;
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
