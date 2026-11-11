import { useMemo } from 'react';
import { comparePrograms, MIN_STUDENTS, MIN_UNITS, programsBySection, textbooksBySection, type TextbookRow } from '../lib/analysis';
import { Ctx, fmt, glossary, Hint, Icon, Note, PageHead, Pill, ScopeNote, signed, verdictLabel, type TFn } from './common';

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
        <Programs c={c} />
      </>
    );
  }

  const others = tb.rows.filter((r) => r.verdict !== 'ref');
  const better = others.filter((r) => r.verdict === 'better');
  const worse = others.filter((r) => r.verdict === 'worse');
  const ctrl = ctrlLabels(t);
  const flipped = tb.rows.find((r) => r.flipped);

  const parts = verdictParts(others, t);

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

      <EffectTable c={c} rows={tb.rows} mine={mine} head={t('Оқулық', 'Учебник')} />
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

      <Programs c={c} />
    </>
  );
}

const ctrlLabels = (t: TFn) => ({
  baseline: t('бастапқы диагностика балы', 'балл входной диагностики'),
  urban: t('қала/ауыл', 'город/село'),
  lang: t('оқыту тілі', 'язык обучения'),
  textbook: t('оқулық', 'учебник'),
});

/** «B — мәнді жоғары; C — айырма дәлелденбеген» сияқты қысқа қорытынды */
function verdictParts(rows: TextbookRow[], t: TFn): string[] {
  const names = (v: TextbookRow['verdict']) =>
    rows
      .filter((r) => r.verdict === v)
      .map((r) => r.name)
      .join(', ');
  const parts: string[] = [];
  if (names('better')) parts.push(t(`${names('better')} — мәнді жоғары`, `${names('better')} — значимо выше`));
  if (names('worse')) parts.push(t(`${names('worse')} — мәнді төмен`, `${names('worse')} — значимо ниже`));
  if (names('unproven')) parts.push(t(`${names('unproven')} — айырма дәлелденбеген`, `${names('unproven')} — разница не доказана`));
  if (names('nodata')) parts.push(t(`${names('nodata')} — дерек жеткіліксіз`, `${names('nodata')} — мало данных`));
  return parts;
}

/** Топтар кестесі: қарапайым және түзетілген айырма, сенім аралығы, қорытынды */
function EffectTable({ c, rows, mine, head }: { c: Ctx; rows: TextbookRow[]; mine?: string; head: string }) {
  const { t } = c;
  const g = glossary(t);
  const cmp = rows.filter((r) => r.verdict !== 'ref' && r.adj !== null);
  const span = Math.max(4, ...cmp.flatMap((r) => [Math.abs(r.lo!), Math.abs(r.hi!), Math.abs(r.naive!)])) * 1.1;
  const pos = (v: number) => Math.min(100, Math.max(0, 50 + (v / span) * 50));
  return (
    <div className="card tablecard">
      <table>
        <thead>
          <tr>
            <th>{head}</th>
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
          {rows.map((r) => (
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
  );
}

/** Оқу бағдарламаларын салыстыру: қолданыстағы және пилоттық (жаңартылған) бағдарлама */
function Programs({ c }: { c: Ctx }) {
  const { t, lang } = c;
  const ds = c.region;
  const res = useMemo(() => comparePrograms(ds), [ds]);
  const sections = useMemo(() => (res?.ref ? programsBySection(ds, lang, res.ref) : []), [ds, lang, res]);
  const title = <h2>{t('Оқу бағдарламаларын салыстыру', 'Сравнение учебных программ')}</h2>;

  if (!res) {
    return (
      <>
        {title}
        <Note>
          {t(
            'Деректе оқу бағдарламасы туралы мәлімет жоқ. Бағдарламаларды (мысалы, қолданыстағы және пилоттық) салыстыру үшін CSV файлына program бағанын қосыңыз: әр сыныптың қай бағдарламамен оқитынын көрсетіңіз.',
            'В данных нет сведений об учебной программе. Чтобы сравнить программы (например, действующую и пилотную), добавьте в CSV-файл столбец program: по какой программе учится каждый класс.',
          )}
        </Note>
      </>
    );
  }
  if (!res.ref) {
    return (
      <>
        {title}
        <Note kind="warn">
          {t(
            `Бағдарламаларды салыстыруға дерек жеткіліксіз: әр бағдарламаға кемінде ${MIN_STUDENTS} оқушы мен ${MIN_UNITS} сынып тобы керек.`,
            `Недостаточно данных для сравнения программ: на каждую программу нужно не менее ${MIN_STUDENTS} учеников и ${MIN_UNITS} классов.`,
          )}
        </Note>
      </>
    );
  }

  const ctrl = ctrlLabels(t);
  const unitOfScope = c.scope.unit !== null ? c.region.units[c.scope.unit] : c.scope.school ? c.region.units.find((u) => u.school === c.scope.school) : undefined;
  const mine = unitOfScope?.program || undefined;
  const others = res.rows.filter((r) => r.verdict !== 'ref');

  // Пилот мектептер кездейсоқ таңдалмаған: бағдарламалардағы қалалық сыныптар үлесі
  const urbanShare = (name: string) => {
    const us = [...new Set(ds.students.map((s) => s.unit))].filter((u) => ds.units[u].program.trim() === name);
    return us.length ? (100 * us.filter((u) => ds.units[u].urban).length) / us.length : NaN;
  };
  const skew = others
    .filter((r) => r.verdict !== 'nodata')
    .map((r) => ({ name: r.name, own: urbanShare(r.name), ref: urbanShare(res.ref) }))
    .find((x) => Math.abs(x.own - x.ref) >= 10);
  const flips = sections.flatMap((s) => s.rows.filter((r) => r.flipped).map((r) => ({ section: s.section, r })));

  return (
    <>
      {title}
      <p className="small">
        {t(
          'Жаңартылған бағдарлама алдымен пилоттық мектептерде сыналады. Ол мектептер кездейсоқ таңдалмағандықтан, біз бастапқы деңгейі, жағдайы және оқулығы бірдей оқушыларды салыстырамыз — мектептерді емес, бағдарламаларды.',
          'Обновлённую программу сначала апробируют в пилотных школах. Они выбраны не случайно, поэтому мы сравниваем учеников с одинаковым входным уровнем, условиями и учебником — программы, а не школы.',
        )}
      </p>

      <div className="card verdict">
        <span className="badge">
          <Icon name={others.some((r) => r.verdict === 'better' || r.verdict === 'worse') ? 'check' : 'info'} size={20} />
        </span>
        <div>
          <p className="headline">{t(`${res.ref}-мен салыстырғанда: `, `По сравнению с программой «${res.ref}»: `) + verdictParts(others, t).join('; ') + '.'}</p>
          <p>
            {t('Түзету факторлары:', 'Поправка на:')} {res.controls.map((x) => ctrl[x]).join(', ') || '—'}.{' '}
            {t('Стандарт қателер мектеп деңгейінде кластерленген.', 'Стандартные ошибки кластеризованы по школам.')}
          </p>
        </div>
      </div>

      <EffectTable c={c} rows={res.rows} mine={mine} head={t('Бағдарлама', 'Программа')} />

      <h2>{t('Бөлімдер бойынша: бағдарлама қай бөлімде күшті не әлсіз?', 'По разделам: в каком разделе программа сильнее или слабее?')}</h2>
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
                      <small>
                        {signed(cell.lo)}…{signed(cell.hi)}
                      </small>
                      <small>
                        {t('қарапайым', 'простая')} {signed(cell.naive)}
                      </small>
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
          `Мәндер — «${res.ref}»-ға қатысты түзетілген айырма, балл, астында 95% сенім аралығы және қарапайым айырма. Боялған ұяшықтар статистикалық мәнді (p < 0,05). Бірнеше бөлімді қатар тексергенде бір-екі «мәнді» ұяшық кездейсоқ шығуы мүмкін.`,
          `Значения — разница с поправкой относительно программы «${res.ref}», в баллах; ниже — 95% доверительный интервал и простая разница. Закрашенные ячейки статистически значимы (p < 0,05). При проверке нескольких разделов одна-две «значимые» ячейки могут появиться случайно.`,
        )}
      </p>

      {flips.map(({ section, r }) => (
        <Note key={`${section}|${r.name}`} kind="warn">
          {t(
            `«${section}» бөлімінде қарапайым салыстыру «${r.name}» үшін ${signed(r.naive)} балл береді, ал түзетілгенде ${signed(r.adj)}. Қарапайым айырманың көбін бағдарлама емес, мектептер құрамы түсіндіреді.`,
            `В разделе «${section}» простое сравнение даёт программе «${r.name}» ${signed(r.naive)} балла, а с поправкой — ${signed(r.adj)}. Большую часть простой разницы объясняет состав школ, а не программа.`,
          )}
        </Note>
      ))}

      <Note>
        {t(
          'Бұл бақылаулық дерек, рандомизацияланған эксперимент емес: пилоттық мектептер кездейсоқ іріктелмеген.',
          'Это наблюдательные данные, а не рандомизированный эксперимент: пилотные школы отобраны не случайно.',
        )}
        {skew &&
          ' ' +
            t(
              `Мысалы, «${skew.name}» сыныптарының ${fmt(skew.own)}%-ы қалада, ал «${res.ref}» сыныптарында бұл үлес ${fmt(skew.ref)}%.`,
              `Например, ${fmt(skew.own)}% классов программы «${skew.name}» — городские, а у программы «${res.ref}» — ${fmt(skew.ref)}%.`,
            )}{' '}
        {t(
          'Біз бастапқы деңгейді, қала/ауылды, оқыту тілін және оқулықты есепке алдық, бірақ пилоттық мектептерге берілетін қосымша әдістемелік қолдау, мұғалімдер біліктілігі сияқты факторлар ескерілмеген. Пилоттың алғашқы жылында мұғалімдер жаңа бағдарламаға енді бейімделеді, сондықтан әсер уақыт өте өзгеруі мүмкін. Бағдарламаны кеңейту туралы шешімді бірнеше жылдың нәтижесімен растаған жөн.',
          'Мы учли входной уровень, город/село, язык обучения и учебник, но не учтены, например, дополнительная методическая поддержка пилотных школ и квалификация учителей. В первый год пилота учителя только привыкают к новой программе, поэтому эффект со временем может измениться. Решение о масштабировании программы стоит подтверждать результатами нескольких лет.',
        )}
        {ds.synthetic && ' ' + t('Демо дерегінде бағдарлама әсері әдісті көрсету үшін ойдан салынған.', 'В демо-данных эффект программы заложен искусственно, для демонстрации метода.')}
      </Note>
    </>
  );
}
