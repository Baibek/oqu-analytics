import { useState } from 'react';
import { predictEffect, recommendHours, HourTopic, TopicStat } from '../lib/analysis';
import { download, toCsv } from '../lib/csv';
import { sum } from '../lib/stats';
import { Ctx, evidenceLabel, fmt, Note, Pill, signed, statusLabel, TFn } from './common';

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
  const [hours, setHours] = useState<number[]>(c.recommended);
  const [locked, setLocked] = useState<Set<number>>(new Set());
  const [snaps, setSnaps] = useState<Snapshot[]>(loadSnaps);
  const eff = predictEffect(model, hours);
  const balance = sum(hours) - model.total;
  const moved = sum(hours.map((h, i) => Math.max(0, h - model.topics[i].planned)));
  const isRec = hours.every((h, i) => h === c.recommended[i]);

  const set = (i: number, v: number) => setHours(hours.map((h, k) => (k === i ? v : h)));
  const toggle = (i: number) => {
    const n = new Set(locked);
    n.has(i) ? n.delete(i) : n.add(i);
    setLocked(n);
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
        why(t, stats[i], model.topics[i], hours[i] - tp.planned, stats[i].prereq?.root ? ds.topics[stats[i].prereq!.i].name[lang] : null),
      ]),
    ]);

  return (
    <>
      <div className="head">
        <div>
          <h1>{t('Оқу сағаттарын бөлу', 'Распределение учебных часов')}</h1>
          <p className="lead">
            {t(
              'Жүйе жылдық сағатты өзгертпей, сағатты жақсы меңгерілген тақырыптан қосымша уақыт шынымен көмектесетін әлсіз тақырыпқа жылжытады. Әр ұсыныстың жанында дәлелі тұр; сағатты өзіңіз өзгертіп, болжамды бірден көре аласыз.',
              'Система не меняет годовой объём, а переносит часы с хорошо усвоенных тем на слабые, где дополнительное время действительно помогает. Рядом с каждой рекомендацией — обоснование; часы можно менять вручную и сразу видеть прогноз.',
            )}
          </p>
        </div>
      </div>

      <section className="kpis">
        <div className="kpi">
          <b>{model.total}</b>
          <span>{t('жылдық сағат (өзгермейді)', 'часов в год (не меняется)')}</span>
        </div>
        <div className="kpi">
          <b>{moved}</b>
          <span>{t('сағат жылжытылды', 'часов перенесено')}</span>
        </div>
        <div className="kpi">
          <b className={eff.avg > 0 ? 'c-ok' : eff.avg < 0 ? 'c-hard' : ''}>{signed(eff.avg)}</b>
          <span>
            {t('күтілетін орташа өзгеріс, балл', 'ожидаемое среднее изменение, балл')} (± {fmt(eff.avgHalf, 1)})
          </span>
        </div>
        <div className={`kpi ${balance ? 'kpi-warn' : ''}`}>
          <b>{balance === 0 ? '✓' : signed(balance, 0)}</b>
          <span>{balance === 0 ? t('теңгерім сақталған', 'баланс соблюдён') : balance > 0 ? t('сағат артық: азайтыңыз', 'лишние часы: уменьшите') : t('сағат жетпейді: қосыңыз', 'часов не хватает: добавьте')}</span>
        </div>
      </section>

      <div className="actions">
        <button className="btn primary" onClick={() => setHours(recommendHours(model, stats, locked, hours))}>
          {locked.size ? t('Құлыптарды ескеріп қайта есептеу', 'Пересчитать с учётом замков') : t('Ұсынысты қолдану', 'Применить рекомендацию')}
        </button>
        <button className="btn" onClick={() => setHours(model.topics.map((x) => x.planned))}>
          {t('Жоспарға қайтару', 'Вернуть план')}
        </button>
        <button
          className="btn"
          disabled={balance !== 0}
          onClick={() => {
            const name = `${t('Нұсқа', 'Вариант')} ${snaps.length + 1}`;
            const next = [...snaps, { name, date: new Date().toISOString().slice(0, 16).replace('T', ' '), hours: Object.fromEntries(ds.topics.map((tp, i) => [tp.id, hours[i]])) }];
            setSnaps(next);
            saveSnaps(next);
          }}
        >
          {t('Нұсқаны сақтау', 'Сохранить вариант')}
        </button>
        <button className="btn" onClick={() => download('hours-plan.csv', rowsCsv())}>
          {t('CSV жүктеп алу', 'Скачать CSV')}
        </button>
        <button className="btn" onClick={() => window.print()}>
          {t('Басып шығару / PDF', 'Печать / PDF')}
        </button>
        {!isRec && <span className="muted small">{t('Қолмен өзгертілген нұсқа', 'Вариант изменён вручную')}</span>}
      </div>

      {snaps.length > 0 && (
        <div className="snaps">
          {snaps.map((s, k) => (
            <span key={k} className="snap">
              <button className="link" onClick={() => setHours(ds.topics.map((tp, i) => s.hours[tp.id] ?? model.topics[i].planned))}>
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

      <div className="scroll">
        <table className="hours">
          <thead>
            <tr>
              <th>{t('Тақырып', 'Тема')}</th>
              <th className="num">{t('Жоспар', 'План')}</th>
              <th className="num">{t('Ұсыныс', 'Рекомендация')}</th>
              <th className="num">Δ</th>
              <th className="num">{t('Күтілетін өзгеріс, балл', 'Ожидаемое изменение, балл')}</th>
              <th>{t('Неге?', 'Почему?')}</th>
              <th title={t('Құлыптау: тақырып сағаты өзгермейді', 'Замок: часы темы не меняются')}>{t('Құлып', 'Замок')}</th>
            </tr>
          </thead>
          <tbody>
            {ds.topics.map((tp, i) => {
              const m = model.topics[i];
              const d = hours[i] - tp.planned;
              const e = eff.per[i];
              return (
                <tr key={tp.id} className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>
                  <td>
                    <b>{tp.name[lang]}</b>
                    <br />
                    <Pill kind={stats[i].status}>{statusLabel(stats[i].status, t)}</Pill>
                  </td>
                  <td className="num">{tp.planned}</td>
                  <td className="num">
                    <span className="stepper">
                      <button disabled={hours[i] <= m.min || locked.has(i)} onClick={() => set(i, hours[i] - 1)} aria-label="−1">
                        −
                      </button>
                      <b>{hours[i]}</b>
                      <button disabled={hours[i] >= m.max || locked.has(i)} onClick={() => set(i, hours[i] + 1)} aria-label="+1">
                        +
                      </button>
                    </span>
                    <small className="muted">
                      {m.min}–{m.max}
                    </small>
                  </td>
                  <td className={`num ${d > 0 ? 'c-ok' : d < 0 ? 'c-hard' : 'muted'}`}>
                    <b>{d === 0 ? '0' : signed(d, 0)}</b>
                  </td>
                  <td className="num">
                    {d === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <>
                        <b>{signed(e.delta)}</b> <small className="muted">± {fmt(e.half, 1)}</small>
                      </>
                    )}
                  </td>
                  <td className="why">{why(t, stats[i], m, d, stats[i].prereq?.root ? ds.topics[stats[i].prereq!.i].name[lang] : null)}</td>
                  <td>
                    <input type="checkbox" checked={locked.has(i)} onChange={() => toggle(i)} aria-label={t('Құлыптау', 'Закрепить')} />
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
