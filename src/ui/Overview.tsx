import { mean, sum } from '../lib/stats';
import { HARD, predictEffect, WATCH } from '../lib/analysis';
import type { Status } from '../lib/analysis';
import { rankUnits } from '../lib/assistant';
import { Ctx, fmt, glossary, Hint, Icon, Note, signed } from './common';
import { BarChart, BarDatum, Donut } from './charts';

const statusOf = (m: number): Status => (m < HARD ? 'hard' : m < WATCH ? 'watch' : 'ok');

export function Overview({ c }: { c: Ctx }) {
  const { t, ds, stats, lang } = c;
  const g = glossary(t);
  const usable = stats.filter((s) => s.status !== 'nodata');
  const hard = usable.filter((s) => s.status === 'hard').sort((a, b) => a.mastery - b.mastery);
  const watch = usable.filter((s) => s.status === 'watch').sort((a, b) => a.mastery - b.mastery);
  const okN = usable.filter((s) => s.status === 'ok').length;
  const schools = new Set(ds.students.map((s) => ds.units[s.unit].school)).size;
  const classes = new Set(ds.students.map((s) => s.unit)).size;
  const local = c.scopeLabel !== null;
  const regAvg = mean(c.regionStats.filter((s) => s.status !== 'nodata').map((s) => s.mastery));
  const subjectLine = `${ds.subject[lang]}${ds.grade ? ` · ${t(`${ds.grade}-сынып`, `${ds.grade} класс`)}` : ''} · ${c.scopeLabel ?? t('Жамбыл облысы', 'Жамбылская область')}`;

  const head = (
    <div className="page-title">
      <div>
        <h1>{t('Басқару панелі', 'Панель управления')}</h1>
        <p>
          {subjectLine} — {t('тест нәтижелерінің тақырып бойынша талдауы', 'анализ результатов тестирования по темам')}
        </p>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => c.openAssistant(t('Негізгі қорытынды қандай? Ең қиын тақырыптар қандай?', 'Какой главный вывод? Какие темы самые сложные?'))}>
          <Icon name="sparkle" size={16} />
          {t('ИИ-дан сұрау', 'Спросить ИИ')}
        </button>
        <button className="btn primary" onClick={() => window.print()}>
          <Icon name="print" size={16} />
          {t('Есепті басып шығару', 'Печать отчёта')}
        </button>
      </div>
    </div>
  );

  if (!usable.length) {
    return (
      <>
        {head}
        <Note kind="warn">
          {t(
            'Қорытынды жасауға дерек жеткіліксіз: облыс бойынша әр тақырыпқа кемінде 30 оқушы мен 5 сынып, бір мектепте кемінде 10 оқушы керек. Сүзгіні алып тастаңыз немесе көбірек дерек жүктеңіз.',
            'Данных недостаточно для выводов: по области нужно не менее 30 учеников и 5 классов на тему, в одной школе — не менее 10 учеников. Снимите фильтр или загрузите больше данных.',
          )}
        </Note>
      </>
    );
  }

  const tb = c.textbooks;
  const proven = tb?.rows.filter((r) => r.verdict === 'better' || r.verdict === 'worse') ?? [];
  const flipped = tb?.rows.find((r) => r.flipped);
  const eff = predictEffect(c.model, c.recommended);
  const moves = c.recommended.map((h, i) => ({ i, d: h - c.model.topics[i].planned })).filter((m) => m.d !== 0);
  const ups = moves.filter((m) => m.d > 0).sort((a, b) => eff.per[b.i].delta - eff.per[a.i].delta);
  const moved = sum(ups.map((m) => m.d));
  const avg = mean(usable.map((s) => s.mastery));
  const diff = local ? avg - regAvg : avg - WATCH;

  const worst = hard[0] ?? watch[0] ?? null;
  const worstName = worst ? ds.topics[worst.i].name[lang] : '';
  const root = worst?.prereq?.root ? worst.prereq : null;

  // Бөлімдер бойынша меңгеру (тақырыптардың оқушы санымен өлшенген орташасы)
  const sections = [...new Set(ds.topics.map((tp) => tp.section[lang]))];
  const bars: BarDatum[] = sections
    .map((sec) => {
      const items = usable.filter((s) => ds.topics[s.i].section[lang] === sec);
      const n = sum(items.map((s) => s.n));
      const v = n ? sum(items.map((s) => s.mastery * s.n)) / n : NaN;
      return { label: sec, value: v, n, status: Number.isNaN(v) ? ('nodata' as Status) : statusOf(v), detail: t(`${items.length} тақырып`, `тем: ${items.length}`) };
    })
    .filter((b) => !Number.isNaN(b.value));

  const weakest = local ? [] : rankUnits(c.region, 'school').slice(0, 5);

  return (
    <>
      {head}
      {local && (
        <div className="note note-scope">
          <Icon name="info" />
          <div>
            {t(
              `Көрсетілген: ${c.scopeLabel}. Тақырыптар мен сағат ұсынысы осы ${c.scope.unit !== null ? 'сыныптың' : 'мектептің'} нәтижесімен, оқулық салыстыруы бүкіл облыс бойынша.`,
              `Показано: ${c.scopeLabel}. Темы и рекомендация по часам — по результатам ${c.scope.unit !== null ? 'этого класса' : 'этой школы'}, сравнение учебников — по всей области.`,
            )}
          </div>
        </div>
      )}

      <section className="kpis icon-kpis" style={{ marginTop: 'var(--space-5)' }} aria-label={t('Негізгі көрсеткіштер', 'Ключевые показатели')}>
        <div className="card ikpi">
          <div className="top">
            <div>
              <div className="lbl">{t('Оқушылар', 'Ученики')}</div>
              <div className="val">{ds.students.length.toLocaleString('ru-RU')}</div>
            </div>
            <span className="tile blue">
              <Icon name="users" size={20} />
            </span>
          </div>
          <div className="foot">
            {schools} {t('мектеп', 'школ')} · {classes} {t('сынып', 'классов')}
          </div>
        </div>
        <div className="card ikpi">
          <div className="top">
            <div>
              <div className="lbl">
                {t('Орташа меңгеру', 'Среднее усвоение')}
                <Hint text={g.mastery} />
              </div>
              <div className="val">{fmt(avg)}%</div>
            </div>
            <span className="tile green">
              <Icon name="target" size={20} />
            </span>
          </div>
          <div className="foot">
            <span className={`trend ${Math.abs(diff) < 0.5 ? 'flat' : diff > 0 ? 'up' : 'down'}`}>
              <Icon name={diff >= 0 ? 'trendUp' : 'trendDown'} size={12} />
              {signed(diff, 1)} п.п.
            </span>
            {local ? t(`облыс ${fmt(regAvg)}%`, `область ${fmt(regAvg)}%`) : t('65% «қалыпты» шегіне қатысты', 'относительно порога «в норме» 65%')}
          </div>
        </div>
        <div className="card ikpi">
          <div className="top">
            <div>
              <div className="lbl">{t('Қиын тақырыптар', 'Сложные темы')}</div>
              <div className="val">
                {hard.length}
                <small className="muted"> / {ds.topics.length}</small>
              </div>
            </div>
            <span className="tile red">
              <Icon name="alert" size={20} />
            </span>
          </div>
          <div className="foot">
            <span className={`trend ${watch.length ? 'down' : 'flat'}`}>{watch.length}</span>
            {t('тақырып назарда (50–65%)', 'тем в зоне риска (50–65%)')}
          </div>
        </div>
        <div className="card ikpi">
          <div className="top">
            <div>
              <div className="lbl">{t('Сағат ұсынысының әсері', 'Эффект плана часов')}</div>
              <div className="val">
                {signed(eff.avg, 2)}
                <small className="muted"> {t('балл', 'балла')}</small>
              </div>
            </div>
            <span className="tile indigo">
              <Icon name="clock" size={20} />
            </span>
          </div>
          <div className="foot">
            {moved ? t(`${moved} сағат жылжыту · жылдық ${c.model.total} сақталады`, `перенос ${moved} ч · годовые ${c.model.total} ч сохраняются`) : t('өзгеріс ұсынылмайды', 'изменений не требуется')}
          </div>
        </div>
      </section>

      <div className="dash">
        <section className="hero span-2" aria-labelledby="hero-title" style={{ margin: 0 }}>
          <span className="hero-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div className="hero-main">
            <p className="hero-eyebrow">
              <Icon name="sparkle" size={13} /> {t('Басты қорытынды', 'Главный вывод')}
            </p>
            <h2 className="hero-title" id="hero-title" style={{ fontSize: 'var(--fs-2xl)' }}>
              {worst
                ? hard.length
                  ? t(`Ең әлсіз тақырып — «${worstName}»: оны оқушылардың ${fmt(worst.mastery)}%-ы ғана меңгерген`, `Самая слабая тема — «${worstName}»: её усвоили только ${fmt(worst.mastery)}% учеников`)
                  : t(`Қиын тақырып жоқ. Ең төмені — «${worstName}», ${fmt(worst.mastery)}%`, `Сложных тем нет. Ниже всех — «${worstName}», ${fmt(worst.mastery)}%`)
                : t('Барлық тақырып жақсы меңгерілген', 'Все темы усвоены хорошо')}
            </h2>
            <p className="hero-sub">
              {root
                ? t(
                    `Ықтимал себебі тірек тақырыпта: «${ds.topics[root.i].name[lang]}» (${fmt(root.mastery)}%). Сағатты алдымен соған беру тиімді.`,
                    `Вероятная причина в опорной теме: «${ds.topics[root.i].name[lang]}» (${fmt(root.mastery)}%). Часы выгоднее сначала дать ей.`,
                  )
                : t(`95% сенім аралығы: ${fmt(worst?.lo)}–${fmt(worst?.hi)}%, ${worst?.n ?? 0} оқушы.`, `95% доверительный интервал: ${fmt(worst?.lo)}–${fmt(worst?.hi)}%, ${worst?.n ?? 0} учеников.`)}
            </p>
            <div className="hero-actions">
              <button className="btn accent" onClick={() => (worst ? c.openTopic(worst.i) : c.go('topics'))}>
                {t('Тақырыпты ашу', 'Открыть тему')} <Icon name="arrow" size={16} />
              </button>
              {worst && (
                <button className="btn on-dark" onClick={() => c.openAssistant(t(`${worstName} неге қиын?`, `Почему тема «${worstName}» сложная?`))}>
                  <Icon name="sparkle" size={16} />
                  {t('ИИ-дан «неге?» деп сұрау', 'Спросить ИИ «почему?»')}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="card panel" aria-labelledby="donut-h">
          <div className="panel-head">
            <div>
              <h2 id="donut-h">{t('Тақырыптар мәртебесі', 'Статус тем')}</h2>
              <p>{t('Меңгеру үлесі бойынша', 'По доле усвоивших')}</p>
            </div>
          </div>
          <Donut
            t={t}
            total={usable.length}
            centerLabel={t('тақырып', 'тем')}
            slices={[
              { key: 'hard', value: hard.length },
              { key: 'watch', value: watch.length },
              { key: 'ok', value: okN },
            ]}
          />
        </section>

        <section className="card panel span-2" aria-labelledby="bars-h">
          <div className="panel-head">
            <div>
              <h2 id="bars-h">{t('Бөлімдер бойынша меңгеру', 'Усвоение по разделам')}</h2>
              <p>{t('Тақырыптардың оқушы санымен өлшенген орташасы; үзік сызықтар — 50% және 65% шектері', 'Среднее по темам, взвешенное числом учеников; пунктир — пороги 50% и 65%')}</p>
            </div>
            <button className="btn ghost sm" onClick={() => c.go('topics')}>
              {t('Барлық тақырып', 'Все темы')} <Icon name="arrow" size={14} />
            </button>
          </div>
          <BarChart data={bars} t={t} title={t('Бөлімдер бойынша меңгеру үлесі', 'Доля усвоивших по разделам')} />
        </section>

        <section className={`card panel answer edge-${proven.length ? 'ok' : 'watch'}`} aria-labelledby="tb-h">
          <div className="panel-head">
            <div>
              <h2 id="tb-h">{t('Оқулықтар', 'Учебники')}</h2>
              <p>
                {tb?.ref ? t(`${tb.ref}-мен салыстырғанда, облыс бойынша`, `относительно ${tb.ref}, по области`) : ''}
                <Hint text={g.adjusted} />
              </p>
            </div>
            <span className={`badge-soft ${proven.length ? 'ok' : 'warn'}`}>{proven.length ? t('Айырма бар', 'Есть разница') : t('Дәлелденбеген', 'Не доказано')}</span>
          </div>
          {!tb || !tb.ref ? (
            <p className="small">{t('Салыстыруға дерек жеткіліксіз.', 'Недостаточно данных для сравнения.')}</p>
          ) : (
            <>
              <ul className="rows">
                {tb.rows
                  .filter((r) => r.verdict !== 'ref')
                  .map((r) => (
                    <li key={r.name}>
                      <span>{r.name}</span>
                      <b className={r.verdict === 'better' ? 'c-ok' : r.verdict === 'worse' ? 'c-hard' : 'muted'}>
                        {r.verdict === 'nodata' ? t('дерек аз', 'мало данных') : r.verdict === 'unproven' ? t('дәлелденбеген', 'не доказано') : `${signed(r.adj)} ${t('балл', 'балла')}`}
                      </b>
                    </li>
                  ))}
              </ul>
              {flipped && (
                <p className="callout">
                  {t(
                    `Орташа балл бойынша ${flipped.name} ${fmt(Math.abs(flipped.naive!), 1)} балл ${flipped.naive! < 0 ? 'төмен' : 'жоғары'} көрінеді — бұл мектептер айырмасы.`,
                    `По средним ${flipped.name} выглядит на ${fmt(Math.abs(flipped.naive!), 1)} балла ${flipped.naive! < 0 ? 'хуже' : 'лучше'} — это разница школ.`,
                  )}
                </p>
              )}
            </>
          )}
          <button className="btn ghost cta" onClick={() => c.go('textbooks')}>
            {t('Толық салыстыру', 'Полное сравнение')} <Icon name="arrow" size={16} />
          </button>
        </section>

        {!local && (
          <section className="card panel span-2" aria-labelledby="weak-h" style={{ padding: 0, gap: 0 }}>
            <div className="panel-head" style={{ padding: 'var(--space-6) var(--space-6) var(--space-4)' }}>
              <div>
                <h2 id="weak-h">{t('Көмек қажет мектептер', 'Школы, которым нужна помощь')}</h2>
                <p>{t('Барлық тақырып бойынша меңгеру үлесі ең төмен 5 мектеп. Бастапқы деңгей ескерілмеген: бұл мұғалімді бағалау емес.', '5 школ с самой низкой долей усвоивших по всем темам. Входной уровень не учтён: это не оценка учителей.')}</p>
              </div>
            </div>
            <div className="tablecard">
              <table>
                <thead>
                  <tr>
                    <th>{t('Мектеп', 'Школа')}</th>
                    <th className="num">{t('Оқушы', 'Учеников')}</th>
                    <th>{t('Меңгеру үлесі', 'Доля усвоивших')}</th>
                    <th className="num">
                      <span className="sr-only">{t('Әрекет', 'Действие')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {weakest.map((r) => (
                    <tr key={r.school}>
                      <td>
                        <b>{r.school}</b>
                        <small className="muted block">{c.region.units.find((u) => u.school === r.school)?.district}</small>
                      </td>
                      <td className="num">{r.n}</td>
                      <td style={{ minWidth: 180 }}>
                        <span className="track" style={{ display: 'block', marginBottom: 4 }} aria-hidden="true">
                          <i className={`fill f-${statusOf(r.mastery)}`} style={{ width: `${r.mastery}%` }} />
                        </span>
                        <small>
                          <b>{fmt(r.mastery)}%</b> · {t(`облыс ${fmt(regAvg)}%`, `область ${fmt(regAvg)}%`)}
                        </small>
                      </td>
                      <td className="num">
                        <button className="btn sm" onClick={() => c.setScope(r.school, null)}>
                          {t('Көру', 'Открыть')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={`card panel answer edge-brand ${local ? 'span-2' : ''}`} aria-labelledby="hours-h">
          <div className="panel-head">
            <div>
              <h2 id="hours-h">{t('Сағатты қайта бөлу', 'Перераспределение часов')}</h2>
              <p>{t(`Жылдық ${c.model.total} сағат өзгермейді`, `Годовые ${c.model.total} ч не меняются`)}</p>
            </div>
          </div>
          {moved ? (
            <ul className="rows">
              {ups.slice(0, 5).map((m) => (
                <li key={m.i}>
                  <span>{ds.topics[m.i].name[lang]}</span>
                  <b className="c-ok">
                    +{m.d} {t('сағ', 'ч')} · {signed(eff.per[m.i].delta)}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-ok">
              <Icon name="check" size={16} />
              {t('Жоспарды өзгертуге негіз жоқ.', 'Оснований менять план нет.')}
            </p>
          )}
          <button className="btn ghost cta" onClick={() => c.go('hours')}>
            {t('Сағат жоспарын ашу', 'Открыть план часов')} <Icon name="arrow" size={16} />
          </button>
        </section>
      </div>

      {ds.synthetic && (
        <Note>
          {t(
            'Бұл демо дерегі синтетикалық: мектептер мен баллдар ойдан алынған, оқулықтар шартты түрде A, B, C, D деп аталған. Өз дерегіңізді «Дерек жүктеу» бетінен CSV арқылы жүктей аласыз.',
            'Демо-данные синтетические: школы и баллы вымышлены, учебники условно названы A, B, C, D. Свои данные можно загрузить CSV-файлом на странице «Загрузка данных».',
          )}
        </Note>
      )}
    </>
  );
}
