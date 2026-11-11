import { useState } from 'react';
import { predictEffect, recommendHours, HourTopic, TopicStat } from '../lib/analysis';
import { download, toCsv } from '../lib/csv';
import { sum } from '../lib/stats';
import { Ctx, evidenceLabel, fmt, glossary, Hint, Icon, Note, PageHead, Pill, ScopeNote, signed, statusLabel, TFn } from './common';

interface Snapshot {
  name: string;
  date: string;
  hours: Record<string, number>;
}
const KEY = 'oqu.snapshots.v1';
const loadSnaps = (): Snapshot[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};
const saveSnaps = (s: Snapshot[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* жеке режимде сақтау мүмкін емес — бет бәрібір жұмыс істейді */
  }
};

/** Әр ұсыныстың дәлелі: қай көрсеткіш, қанша оқушы, қандай сенімділік */
export function why(t: TFn, s: TopicStat, h: HourTopic, delta: number, prereqName: string | null): string {
  if (s.status === 'nodata') return t('Дерек жеткіліксіз, сондықтан жоспар өзгертілмейді.', 'Данных недостаточно, поэтому план не меняется.');
  const base = t(
    `Меңгеру ${fmt(s.mastery)}% (95% СА ${fmt(s.lo)}–${fmt(s.hi)}), ${s.n} оқушы.`,
    `Усвоение ${fmt(s.mastery)}% (95% ДИ ${fmt(s.lo)}–${fmt(s.hi)}), ${s.n} учеников.`,
  );
  const ev =
    h.evidence === 'none'
      ? t('Сағаты көп сыныптарда нәтиже жоғары екені байқалмайды.', 'В классах с большим числом часов результат не выше.')
      : t(
          `Сағаты көп сыныптарда балл жоғары: +1 сағат ≈ ${signed(h.perHour)} балл (${h.units} сынып тобы, сенімділік ${evidenceLabel(h.evidence, t)}).`,
          `В классах с большим числом часов балл выше: +1 час ≈ ${signed(h.perHour)} балла (${h.units} классов, уверенность ${evidenceLabel(h.evidence, t)}).`,
        );
  const root = prereqName
    ? t(` Ықтимал себебі тірек тақырыпта («${prereqName}»): алдымен соны күшейткен жөн.`, ` Вероятная причина в опорной теме («${prereqName}»): сначала стоит усилить её.`)
    : '';
  if (delta > 0) return `${base} ${ev}${root}`;
  if (delta < 0)
    return (
      base +
      ' ' +
      (h.evidence === 'none'
        ? t('Тақырып жақсы меңгерілген және сағатқа сезімтал емес, сондықтан сағатты қиын тақырыпқа беруге болады.', 'Тема усвоена хорошо и не чувствительна к часам, поэтому час можно отдать сложной теме.')
        : t(
            `Тақырып жақсы меңгерілген; сағатты азайтудан күтілетін шығын аз (−1 сағат ≈ ${signed(-h.perHour)} балл).`,
            `Тема усвоена хорошо; ожидаемая потеря от сокращения мала (−1 час ≈ ${signed(-h.perHour)} балла).`,
          ))
    );
  if (s.status !== 'ok' && h.evidence === 'none')
    return (
      base +
      ' ' +
      t(
        'Тақырып әлсіз, бірақ сағат қосудың пайдасына дәлел жоқ: мәселе әдістемеде, оқулық бөлімінде немесе тірек тақырыпта болуы мүмкін.',
        'Тема слабая, но подтверждения пользы от дополнительных часов нет: причина может быть в методике, разделе учебника или опорной теме.',
      ) +
      root
    );
  return `${base} ${ev}${root} ` + t('Өзгеріс ұсынылмайды.', 'Изменение не рекомендуется.');
}

export function Hours({ c }: { c: Ctx }) {
  const { t, ds, stats, lang, model } = c;
  const g = glossary(t);
  const [hours, setHours] = useState<number[]>(c.recommended);
  const [locked, setLocked] = useState<Set<number>>(new Set());
  const [snaps, setSnaps] = useState<Snapshot[]>(loadSnaps);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const eff = predictEffect(model, hours);
  const balance = sum(hours) - model.total;
  const moved = sum(hours.map((h, i) => Math.max(0, h - model.topics[i].planned)));
  const isRec = hours.every((h, i) => h === c.recommended[i]);
  const isPlan = hours.every((h, i) => h === model.topics[i].planned);
  const rootName = (i: number) => (stats[i].prereq?.root ? ds.topics[stats[i].prereq!.i].name[lang] : null);

  const set = (i: number, v: number) => setHours(hours.map((h, k) => (k === i ? v : h)));
  const toggle = (set0: Set<number>, i: number) => {
    const n = new Set(set0);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  };
  const rowsCsv = () =>
    toCsv([
      ['topic', 'section', 'planned_hours', 'recommended_hours', 'delta', 'expected_score_change', 'mastery_pct', 'ci_low', 'ci_high', 'students', 'confidence', 'reason'],
      ...ds.topics.map((tp, i) => [
        tp.name[lang],
        tp.section[lang],
        tp.planned,
        hours[i],
        hours[i] - tp.planned,
        eff.per[i].delta.toFixed(2),
        stats[i].mastery.toFixed(1),
        stats[i].lo.toFixed(1),
        stats[i].hi.toFixed(1),
        stats[i].n,
        evidenceLabel(model.topics[i].evidence, t),
        why(t, stats[i], model.topics[i], hours[i] - tp.planned, rootName(i)),
      ]),
    ]);

  return (
    <>
      <PageHead
        title={t('Оқу сағаттарын бөлу', 'Распределение учебных часов')}
        question={t(
          'Жылдық сағатты өзгертпей, оны қай тақырыпқа көбірек берген жөн? Жүйе сағатты жақсы меңгерілген тақырыптан қосымша уақыт шынымен көмектесетін әлсіз тақырыпқа жылжытады. Сағатты өзіңіз де өзгертіп, болжамды бірден көре аласыз.',
          'Не меняя годовой объём, каким темам стоит дать больше часов? Система переносит часы с хорошо усвоенных тем на слабые, где дополнительное время действительно помогает. Часы можно менять вручную и сразу видеть прогноз.',
        )}
      />

      <ScopeNote c={c} what="hours" />

      <div className="card sticky">
        <div className="metrics">
          <div className="metric">
            <div className="v">{model.total}</div>
            <div className="l">{t('жылдық сағат', 'часов в год')}</div>
          </div>
          <div className="metric">
            <div className="v">{moved}</div>
            <div className="l">{t('жылжытылды', 'перенесено')}</div>
          </div>
          <div className="metric">
            <div className={`v ${eff.avg > 0 ? 'c-ok' : eff.avg < 0 ? 'c-hard' : ''}`}>
              {signed(eff.avg)} <small className="muted">± {fmt(eff.avgHalf, 1)}</small>
            </div>
            <div className="l">{t('күтілетін орташа өзгеріс, балл', 'ожидаемое изменение, балл')}</div>
          </div>
          <div className={`metric ${balance ? 'bad' : ''}`}>
            <div className="v balance">
              {balance === 0 ? <Icon name="check" size={20} /> : <Icon name="alert" size={20} />}
              {balance === 0 ? '' : signed(balance, 0)}
            </div>
            <div className="l">{balance === 0 ? t('теңгерім сақталған', 'баланс соблюдён') : balance > 0 ? t('сағат артық — азайтыңыз', 'лишние часы — уменьшите') : t('сағат жетпейді — қосыңыз', 'не хватает часов — добавьте')}</div>
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" disabled={isRec && !locked.size} onClick={() => setHours(recommendHours(model, stats, locked, hours))}>
            <Icon name={isRec && !locked.size ? 'check' : 'sparkle'} size={16} />
            {locked.size ? t('Құлыппен қайта есептеу', 'Пересчитать с замками') : isRec ? t('Ұсыныс қолданылды', 'Рекомендация применена') : t('Ұсынысты қолдану', 'Применить рекомендацию')}
          </button>
          <button className="btn" disabled={isPlan} onClick={() => setHours(model.topics.map((x) => x.planned))}>
            <Icon name="reset" size={16} />
            {t('Жоспарға қайтару', 'Вернуть план')}
          </button>
        </div>
      </div>

      <div className="actions" style={{ marginBottom: 16 }}>
        <button
          className="btn sm"
          disabled={balance !== 0}
          onClick={() => {
            const name = `${t('Нұсқа', 'Вариант')} ${snaps.length + 1}`;
            const next = [...snaps, { name, date: new Date().toISOString().slice(0, 16).replace('T', ' '), hours: Object.fromEntries(ds.topics.map((tp, i) => [tp.id, hours[i]])) }];
            setSnaps(next);
            saveSnaps(next);
          }}
        >
          <Icon name="save" size={15} />
          {t('Нұсқаны сақтау', 'Сохранить вариант')}
        </button>
        <button className="btn sm" onClick={() => download('hours-plan.csv', rowsCsv())}>
          <Icon name="download" size={15} />
          CSV
        </button>
        <button className="btn sm" onClick={() => window.print()}>
          <Icon name="print" size={15} />
          {t('Басып шығару / PDF', 'Печать / PDF')}
        </button>
        {!isRec && !isPlan && <Pill kind="watch">{t('Қолмен өзгертілген', 'Изменено вручную')}</Pill>}
      </div>

      {snaps.length > 0 && (
        <div className="snaps">
          <span className="small">{t('Сақталған нұсқалар:', 'Сохранённые варианты:')}</span>
          {snaps.map((s, k) => (
            <span key={k} className="snap">
              <button className="name" onClick={() => setHours(ds.topics.map((tp, i) => s.hours[tp.id] ?? model.topics[i].planned))}>
                {s.name}
              </button>
              <small className="muted">{s.date}</small>
              <button
                className="x"
                aria-label={t('Жою', 'Удалить')}
                onClick={() => {
                  const next = snaps.filter((_, j) => j !== k);
                  setSnaps(next);
                  saveSnaps(next);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="card tablecard">
        <table className="hours">
          <thead>
            <tr>
              <th>{t('Тақырып', 'Тема')}</th>
              <th className="num">{t('Жоспар', 'План')}</th>
              <th>{t('Ұсыныс', 'Рекомендация')}</th>
              <th className="num">Δ</th>
              <th className="num">{t('Болжам, балл', 'Прогноз, балл')}</th>
              <th>
                {t('Неге?', 'Почему?')}
                <Hint text={g.evidence} />
              </th>
              <th>{t('Құлып', 'Замок')}</th>
            </tr>
          </thead>
          <tbody>
            {ds.topics.map((tp, i) => {
              const m = model.topics[i];
              const d = hours[i] - tp.planned;
              const e = eff.per[i];
              const isLocked = locked.has(i);
              const open = expanded.has(i);
              return (
                <tr key={tp.id} className={`${d > 0 ? 'up' : d < 0 ? 'down' : ''} ${isLocked ? 'locked' : ''}`}>
                  <td className="tn">
                    <b>{tp.name[lang]}</b>
                    <Pill kind={stats[i].status}>{statusLabel(stats[i].status, t)}</Pill>
                  </td>
                  <td className="num">{tp.planned}</td>
                  <td>
                    <span className="stepper">
                      <button disabled={hours[i] <= m.min || isLocked} onClick={() => set(i, hours[i] - 1)} aria-label={t(`${tp.name[lang]}: бір сағатқа азайту`, `${tp.name[lang]}: уменьшить на час`)}>
                        −
                      </button>
                      <b className="tnum">{hours[i]}</b>
                      <button disabled={hours[i] >= m.max || isLocked} onClick={() => set(i, hours[i] + 1)} aria-label={t(`${tp.name[lang]}: бір сағатқа көбейту`, `${tp.name[lang]}: увеличить на час`)}>
                        +
                      </button>
                    </span>
                    <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                      {t('шек', 'пределы')} {m.min}–{m.max}
                    </small>
                  </td>
                  <td className="num">
                    <span className={`delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'zero'}`}>{d === 0 ? '0' : signed(d, 0)}</span>
                  </td>
                  <td className="num">
                    {d === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <>
                        <b className={e.delta > 0 ? 'c-ok' : e.delta < 0 ? 'c-hard' : ''}>{signed(e.delta)}</b>
                        <small>± {fmt(e.half, 1)}</small>
                      </>
                    )}
                  </td>
                  <td className={`why ${open ? 'open' : ''}`}>
                    <span className="txt">{why(t, stats[i], m, d, rootName(i))}</span>
                    <button className="more" onClick={() => setExpanded(toggle(expanded, i))} aria-expanded={open}>
                      {open ? t('Жасыру', 'Свернуть') : t('Толығырақ', 'Подробнее')}
                    </button>
                  </td>
                  <td>
                    <label className="lock">
                      <input type="checkbox" checked={isLocked} onChange={() => setLocked(toggle(locked, i))} />
                      <span className="sr-only">{t('Құлыптау', 'Закрепить')}</span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Note>
        {t(
          'Шектеулер: әр тақырып жоспардан ±30%-дан (кемінде ±1 сағат) аспайды және деректе нақты байқалған сағат аралығынан шықпайды; сағат тек «қалыпты» тақырыптан алынады. Болжам сыныптар арасындағы нақты сағат айырмасына сүйенеді, яғни бақылаулық дерек: өзгерісті алдымен бірнеше мектепте сынап көрген жөн.',
          'Ограничения: каждая тема меняется не более чем на ±30% от плана (минимум ±1 час) и не выходит за диапазон часов, реально наблюдавшийся в данных; часы берутся только у тем «в норме». Прогноз опирается на фактические различия часов между классами, то есть на наблюдательные данные: изменение стоит сначала проверить в нескольких школах.',
        )}
      </Note>
    </>
  );
}
