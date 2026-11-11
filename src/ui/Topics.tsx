import { useState } from 'react';
import { HARD, MIN_STUDENTS, MIN_UNITS, PASS, WATCH } from '../lib/analysis';
import { Ctx, evidenceLabel, fmt, Note, Pill, signed, statusLabel } from './common';

export function Topics({ c }: { c: Ctx }) {
  const { t, ds, stats, lang, model } = c;
  const [sort, setSort] = useState<'mastery' | 'plan'>('mastery');
  const [open, setOpen] = useState<number | null>(null);
  const rows = sort === 'plan' ? stats : [...stats].sort((a, b) => (a.status === 'nodata' ? 1 : b.status === 'nodata' ? -1 : a.mastery - b.mastery));
  const count = (s: string) => stats.filter((x) => x.status === s).length;

  return (
    <>
      <div className="head">
        <div>
          <h1>{t('Тақырыптарды меңгеру', 'Усвоение тем')}</h1>
          <p className="lead">
            {t(
              `Меңгеру үлесі — тақырып бойынша ${PASS} балдан жоғары алған оқушылардың пайызы. Жақшада 95% сенім аралығы: дерек аз болған сайын ол кеңейеді.`,
              `Доля усвоивших — процент учеников, набравших по теме ${PASS} баллов и выше. В скобках 95% доверительный интервал: чем меньше данных, тем он шире.`,
            )}
          </p>
        </div>
        <div className="seg">
          <button className={sort === 'mastery' ? 'on' : ''} onClick={() => setSort('mastery')}>
            {t('Қиыны алдымен', 'Сначала сложные')}
          </button>
          <button className={sort === 'plan' ? 'on' : ''} onClick={() => setSort('plan')}>
            {t('Бағдарлама ретімен', 'По программе')}
          </button>
        </div>
      </div>

      <div className="legend">
        <Pill kind="hard">
          {statusLabel('hard', t)}: {count('hard')}
        </Pill>
        <span className="muted">&lt; {HARD}%</span>
        <Pill kind="watch">
          {statusLabel('watch', t)}: {count('watch')}
        </Pill>
        <span className="muted">
          {HARD}–{WATCH}%
        </span>
        <Pill kind="ok">
          {statusLabel('ok', t)}: {count('ok')}
        </Pill>
        <span className="muted">≥ {WATCH}%</span>
        {count('nodata') > 0 && (
          <Pill kind="nodata">
            {statusLabel('nodata', t)}: {count('nodata')}
          </Pill>
        )}
      </div>

      <div className="topics">
        {rows.map((s) => {
          const tp = ds.topics[s.i];
          const h = model.topics[s.i];
          const isOpen = open === s.i;
          return (
            <div key={s.i} className={`trow ${isOpen ? 'open' : ''}`}>
              <button className="tmain" onClick={() => setOpen(isOpen ? null : s.i)} aria-expanded={isOpen}>
                <span className="tname">
                  <b>{tp.name[lang]}</b>
                  <small>{tp.section[lang]}</small>
                </span>
                <span className="track" aria-hidden="true">
                  <i className="tick" style={{ left: `${HARD}%` }} />
                  <i className="tick" style={{ left: `${WATCH}%` }} />
                  {s.status !== 'nodata' && (
                    <>
                      <i className={`fill f-${s.status}`} style={{ width: `${s.mastery}%` }} />
                      <i className="ci" style={{ left: `${s.lo}%`, width: `${Math.max(s.hi - s.lo, 0.5)}%` }} />
                    </>
                  )}
                </span>
                <span className="tval">
                  {s.status === 'nodata' ? (
                    '—'
                  ) : (
                    <>
                      <b>{fmt(s.mastery)}%</b>{' '}
                      <small>
                        ({fmt(s.lo)}–{fmt(s.hi)})
                      </small>
                    </>
                  )}
                </span>
                <span className="tstatus">
                  <Pill kind={s.status}>
                    {statusLabel(s.status, t)}
                    {s.borderline ? ' ≈' : ''}
                  </Pill>
                </span>
              </button>
              {isOpen && (
                <div className="tdetail">
                  {s.status === 'nodata' ? (
                    <p>
                      {t(
                        `Қорытынды жасалмайды: ${s.n} оқушы, ${s.units} сынып тобы. Кемінде ${MIN_STUDENTS} оқушы мен ${MIN_UNITS} топ керек.`,
                        `Вывод не делается: ${s.n} учеников, ${s.units} классов. Нужно не менее ${MIN_STUDENTS} учеников и ${MIN_UNITS} классов.`,
                      )}
                    </p>
                  ) : (
                    <>
                      <dl>
                        <div>
                          <dt>{t('Оқушы / сынып тобы', 'Учеников / классов')}</dt>
                          <dd>
                            {s.n} / {s.units}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('Орташа балл', 'Средний балл')}</dt>
                          <dd>{fmt(s.mean, 1)}</dd>
                        </div>
                        <div>
                          <dt>{t('Қала / ауыл', 'Город / село')}</dt>
                          <dd>{s.urban !== null && s.rural !== null ? `${fmt(s.urban)}% / ${fmt(s.rural)}%` : '—'}</dd>
                        </div>
                        <div>
                          <dt>{t('Сыныптар арасындағы шашырау', 'Разброс между классами')}</dt>
                          <dd>± {fmt(s.spread)} {t('п.п.', 'п.п.')}</dd>
                        </div>
                        <div>
                          <dt>{t('Жоспарлы сағат', 'Часов по плану')}</dt>
                          <dd>{tp.planned}</dd>
                        </div>
                        <div>
                          <dt>{t('+1 сағаттың күтілетін әсері', 'Ожидаемый эффект +1 часа')}</dt>
                          <dd>
                            {h.evidence === 'none' ? t('дәлел жоқ', 'нет подтверждения') : `${signed(h.perHour)} ${t('балл', 'балла')}`}{' '}
                            <small>
                              ({t('сенімділік', 'уверенность')}: {evidenceLabel(h.evidence, t)})
                            </small>
                          </dd>
                        </div>
                      </dl>
                      {s.borderline && (
                        <p className="small">
                          {t(
                            '≈ белгісі: сенім аралығы шекті кесіп өтеді, сондықтан мәртебе нақты емес.',
                            'Знак ≈: доверительный интервал пересекает порог, поэтому статус неточен.',
                          )}
                        </p>
                      )}
                      {s.prereq && (
                        <p className={s.prereq.root ? 'root' : 'small'}>
                          {s.prereq.root
                            ? t(
                                `Ықтимал себебі тірек тақырыпта: «${ds.topics[s.prereq.i].name[lang]}» тақырыбын оқушылардың ${fmt(s.prereq.mastery)}%-ы ғана меңгерген, ал екі тақырыптың нәтижесі тығыз байланысты (r = ${fmt(s.prereq.r, 2)}). Алдымен тірек тақырыпты күшейткен жөн.`,
                                `Вероятная причина в опорной теме: «${ds.topics[s.prereq.i].name[lang]}» усвоили только ${fmt(s.prereq.mastery)}% учеников, а результаты двух тем тесно связаны (r = ${fmt(s.prereq.r, 2)}). Сначала стоит усилить опорную тему.`,
                              )
                            : t(
                                `Тірек тақырып: «${ds.topics[s.prereq.i].name[lang]}» (меңгеру ${fmt(s.prereq.mastery)}%, байланыс r = ${fmt(s.prereq.r, 2)}).`,
                                `Опорная тема: «${ds.topics[s.prereq.i].name[lang]}» (усвоение ${fmt(s.prereq.mastery)}%, связь r = ${fmt(s.prereq.r, 2)}).`,
                              )}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Note>
        {t(
          'Жолды басса, толық мәлімет ашылады. Қара сызық — 95% сенім аралығы, тік белгілер — 50% және 65% шектері.',
          'Нажмите на строку, чтобы раскрыть детали. Тёмная линия — 95% доверительный интервал, вертикальные метки — пороги 50% и 65%.',
        )}
      </Note>
    </>
  );
}
