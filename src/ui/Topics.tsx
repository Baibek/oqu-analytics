import { Fragment, useState } from 'react';
import type { Status, TopicStat } from '../lib/analysis';
import { HARD, MIN_LOCAL, MIN_STUDENTS, MIN_UNITS, PASS, WATCH } from '../lib/analysis';
import { Ctx, evidenceLabel, fmt, glossary, Hint, Icon, Note, PageHead, Pill, ScopeNote, signed, statusLabel } from './common';

type View = 'difficulty' | 'section';

export function Topics({ c }: { c: Ctx }) {
  const { t, ds, stats, lang, model } = c;
  const local = c.scopeLabel !== null;
  const g = glossary(t);
  const [view, setView] = useState<View>('difficulty');
  const [only, setOnly] = useState<Status | 'all'>('all');
  const [open, setOpen] = useState<number | null>(null);

  const count = (s: Status) => stats.filter((x) => x.status === s).length;
  const visible = stats.filter((s) => only === 'all' || s.status === only);
  const byDifficulty = [...visible].sort((a, b) => (a.status === 'nodata' ? 1 : b.status === 'nodata' ? -1 : a.mastery - b.mastery));
  const sections = [...new Set(ds.topics.map((tp) => tp.section[lang]))];

  const row = (s: TopicStat) => {
    const tp = ds.topics[s.i];
    const h = model.topics[s.i];
    const isOpen = open === s.i;
    const pre = s.prereq;
    const reg = local ? c.regionStats[s.i] : null;
    const regOk = reg && reg.status !== 'nodata';
    return (
      <div key={s.i} className={`trow ${isOpen ? 'open' : ''}`}>
        <button className="tmain" onClick={() => setOpen(isOpen ? null : s.i)} aria-expanded={isOpen}>
          <span className="tname">
            <b>{tp.name[lang]}</b>
            {view === 'difficulty' && <small>{tp.section[lang]}</small>}
          </span>
          <span className="track" aria-hidden="true">
            {s.status !== 'nodata' && (
              <>
                <i className={`fill f-${s.status}`} style={{ width: `${s.mastery}%` }} />
                <i className="ci" style={{ left: `${s.lo}%`, width: `${Math.max(s.hi - s.lo, 0.5)}%` }} />
              </>
            )}
            <i className="tick" style={{ left: `${HARD}%` }} />
            <i className="tick" style={{ left: `${WATCH}%` }} />
            {regOk && <i className="reg" style={{ left: `${reg.mastery}%` }} />}
          </span>
          <span className="tval">
            {s.status === 'nodata' ? (
              <span className="muted">—</span>
            ) : (
              <>
                <b>{fmt(s.mastery)}%</b>{' '}
                <small>
                  {fmt(s.lo)}–{fmt(s.hi)}
                </small>
                {regOk && (
                  <span className="reg-v">
                    {t('облыс', 'область')} {fmt(reg.mastery)}% ({signed(s.mastery - reg.mastery, 0)})
                  </span>
                )}
              </>
            )}
          </span>
          <span className="tstatus">
            <Pill kind={s.status}>
              {statusLabel(s.status, t)}
              {s.borderline ? ' ≈' : ''}
            </Pill>
          </span>
          <span className="chev">
            <Icon name="chevron" size={16} />
          </span>
        </button>
        {isOpen && (
          <div className="tdetail">
            {s.status === 'nodata' ? (
              <p className="small">
                {t(
                  local
                    ? `Қорытынды жасалмайды: ${s.n} оқушы. Кемінде ${MIN_LOCAL} оқушы керек.`
                    : `Қорытынды жасалмайды: ${s.n} оқушы, ${s.units} сынып. Кемінде ${MIN_STUDENTS} оқушы мен ${MIN_UNITS} сынып керек.`,
                  local
                    ? `Вывод не делается: ${s.n} учеников. Нужно не менее ${MIN_LOCAL} учеников.`
                    : `Вывод не делается: ${s.n} учеников, ${s.units} классов. Нужно не менее ${MIN_STUDENTS} учеников и ${MIN_UNITS} классов.`,
                )}
              </p>
            ) : (
              <>
                {pre?.root && (
                  <div className="rootcause">
                    <Icon name="alert" />
                    <div>
                      <b>{t('Ықтимал себебі — тірек тақырыпта', 'Вероятная причина — в опорной теме')}</b>
                      {t(
                        `«${ds.topics[pre.i].name[lang]}» тақырыбын оқушылардың тек ${fmt(pre.mastery)}%-ы меңгерген, ал екі тақырыптың нәтижесі тығыз байланысты (r = ${fmt(pre.r, 2)}). Алдымен тірек тақырыпты күшейткен жөн.`,
                        `«${ds.topics[pre.i].name[lang]}» усвоили только ${fmt(pre.mastery)}% учеников, а результаты двух тем тесно связаны (r = ${fmt(pre.r, 2)}). Сначала стоит усилить опорную тему.`,
                      )}
                    </div>
                  </div>
                )}
                <dl className="facts" style={{ marginTop: pre?.root ? 12 : 8 }}>
                  <div>
                    <dt>{t('Оқушы / сынып', 'Учеников / классов')}</dt>
                    <dd>
                      {s.n} / {s.units}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Орташа балл', 'Средний балл')}</dt>
                    <dd>{fmt(s.mean, 1)}</dd>
                  </div>
                  {local ? (
                    <div>
                      <dt>{t('Облыс бойынша', 'По области')}</dt>
                      <dd>
                        {regOk ? `${fmt(reg.mastery)}%` : '—'} <small className="muted">{regOk ? `(${t('айырма', 'разница')} ${signed(s.mastery - reg.mastery, 0)} п.п.)` : ''}</small>
                      </dd>
                    </div>
                  ) : (
                    <>
                      <div>
                        <dt>{t('Қала / ауыл', 'Город / село')}</dt>
                        <dd>{s.urban !== null && s.rural !== null ? `${fmt(s.urban)}% / ${fmt(s.rural)}%` : '—'}</dd>
                      </div>
                      <div>
                        <dt>{t('Сыныптар арасындағы шашырау', 'Разброс между классами')}</dt>
                        <dd>± {fmt(s.spread)} п.п.</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt>{t('Жоспарлы сағат', 'Часов по плану')}</dt>
                    <dd>{tp.planned}</dd>
                  </div>
                  <div>
                    <dt>
                      {t('+1 сағаттың әсері', 'Эффект +1 часа')}
                      <Hint text={g.evidence} />
                    </dt>
                    <dd>
                      {h.evidence === 'none' ? t('дәлел жоқ', 'нет подтверждения') : `${signed(h.perHour)} ${t('балл', 'балла')}`}{' '}
                      <small className="muted">({evidenceLabel(h.evidence, t)})</small>
                    </dd>
                  </div>
                </dl>
                {pre && !pre.root && (
                  <p className="small">
                    {t(
                      `Тірек тақырып: «${ds.topics[pre.i].name[lang]}» (меңгеру ${fmt(pre.mastery)}%, байланыс r = ${fmt(pre.r, 2)}).`,
                      `Опорная тема: «${ds.topics[pre.i].name[lang]}» (усвоение ${fmt(pre.mastery)}%, связь r = ${fmt(pre.r, 2)}).`,
                    )}
                  </p>
                )}
                {s.borderline && (
                  <p className="small">
                    {t('≈ белгісі: сенім аралығы шекті кесіп өтеді, сондықтан мәртебе нақты емес.', 'Знак ≈: доверительный интервал пересекает порог, поэтому статус неточен.')}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const chips: [Status | 'all', string, string][] = [
    ['all', t('Барлығы', 'Все'), ''],
    ['hard', statusLabel('hard', t), 'hard'],
    ['watch', statusLabel('watch', t), 'watch'],
    ['ok', statusLabel('ok', t), 'ok'],
  ];
  if (count('nodata')) chips.push(['nodata', statusLabel('nodata', t), '']);

  return (
    <>
      <PageHead
        title={t('Тақырыптарды меңгеру', 'Усвоение тем')}
        question={t(
          `Оқушылар қай тақырыпты меңгермей жүр және неге? Әр тақырып үшін ${PASS}+ балл алғандардың үлесі көрсетілген. Толық мәлімет пен ықтимал себебін көру үшін жолды басыңыз.`,
          `Какие темы ученики не усваивают и почему? Для каждой темы показана доля набравших ${PASS}+ баллов. Нажмите на строку, чтобы увидеть детали и вероятную причину.`,
        )}
      >
        <div className="seg" role="group" aria-label={t('Көрініс', 'Вид')}>
          <button aria-pressed={view === 'difficulty'} onClick={() => setView('difficulty')}>
            {t('Қиыны алдымен', 'Сначала сложные')}
          </button>
          <button aria-pressed={view === 'section'} onClick={() => setView('section')}>
            {t('Бөлім бойынша', 'По разделам')}
          </button>
        </div>
      </PageHead>

      <ScopeNote c={c} what="topics" />

      <div className="toolbar">
        <div className="chips" role="group" aria-label={t('Мәртебе бойынша сүзгі', 'Фильтр по статусу')}>
          {chips.map(([id, label, dot]) => (
            <button key={id} className="chip" aria-pressed={only === id} onClick={() => setOnly(id)}>
              {dot && <i className={`dot dot-${dot}`} />}
              {label}
              <span className="n">{id === 'all' ? stats.length : count(id)}</span>
            </button>
          ))}
        </div>
        <span className="small">
          {t('Меңгеру үлесі', 'Доля усвоивших')}
          <Hint text={g.mastery} /> · 95% {t('СА', 'ДИ')}
          <Hint text={g.ci} />
        </span>
      </div>

      <div className="card tlist">
        {visible.length === 0 && <p className="pad small">{t('Бұл мәртебеде тақырып жоқ.', 'Тем с таким статусом нет.')}</p>}
        {view === 'difficulty'
          ? byDifficulty.map(row)
          : sections.map((sec) => {
              const items = visible.filter((s) => ds.topics[s.i].section[lang] === sec);
              if (!items.length) return null;
              return (
                <Fragment key={sec}>
                  <div className="tsec">{sec}</div>
                  {items.map(row)}
                </Fragment>
              );
            })}
      </div>

      <div className="scale">
        <span>
          <i className="dot dot-hard" /> {statusLabel('hard', t)} &lt; {HARD}%
        </span>
        <span>
          <i className="dot dot-watch" /> {statusLabel('watch', t)} {HARD}–{WATCH}%
        </span>
        <span>
          <i className="dot dot-ok" /> {statusLabel('ok', t)} ≥ {WATCH}%
        </span>
        <span>
          <i className="k-ci" /> {t('95% сенім аралығы', '95% доверительный интервал')}
        </span>
        {local && (
          <span>
            <i className="k-reg" /> {t('облыс деңгейі', 'уровень области')}
          </span>
        )}
      </div>
      {ds.synthetic && (
        <Note>
          {t('Демо дерегі синтетикалық: тақырыптар нақты бағдарламадан, баллдар ойдан алынған.', 'Демо-данные синтетические: темы взяты из программы, баллы вымышлены.')}
        </Note>
      )}
    </>
  );
}
