import { mean, sum } from '../lib/stats';
import { predictEffect } from '../lib/analysis';
import { Ctx, fmt, glossary, Hint, Icon, Note, PageHead, signed } from './common';

export function Overview({ c }: { c: Ctx }) {
  const { t, ds, stats, lang } = c;
  const g = glossary(t);
  const usable = stats.filter((s) => s.status !== 'nodata');
  const hard = usable.filter((s) => s.status === 'hard').sort((a, b) => a.mastery - b.mastery);
  const watch = usable.filter((s) => s.status === 'watch');
  const schools = new Set(ds.students.map((s) => ds.units[s.unit].school)).size;
  const classes = new Set(ds.students.map((s) => s.unit)).size;
  const local = c.scopeLabel !== null;
  const regAvg = mean(c.regionStats.filter((s) => s.status !== 'nodata').map((s) => s.mastery));
  const myBook = c.scope.unit !== null ? ds.units[c.scope.unit].textbook : null;

  const head = (
    <PageHead
      title={t('Шолу', 'Обзор')}
      question={t(
        'Үш негізгі сұраққа қысқа жауап: қай тақырып қиын, оқулықтардың айырмасы бар ма, сағатты қалай бөлген жөн. Толық дәлел әр карточканың астындағы бетте.',
        'Короткие ответы на три главных вопроса: какие темы сложные, различаются ли учебники, как распределить часы. Полные обоснования — на странице под каждой карточкой.',
      )}
    />
  );

  if (!usable.length) {
    return (
      <>
        {head}
        <Note kind="warn">
          {t(
            'Қорытынды жасауға дерек жеткіліксіз: әр тақырыпқа кемінде 30 оқушы мен 5 сынып тобы керек. Сүзгіні алып тастаңыз немесе көбірек дерек жүктеңіз.',
            'Данных недостаточно для выводов: по каждой теме нужно не менее 30 учеников и 5 классов. Снимите фильтр или загрузите больше данных.',
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

  const worst = hard[0] ?? [...watch].sort((x, y) => x.mastery - y.mastery)[0] ?? null;
  const worstName = worst ? ds.topics[worst.i].name[lang] : '';
  const root = worst?.prereq?.root ? worst.prereq : null;
  const avg = mean(usable.map((s) => s.mastery));

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <span className="hero-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className="hero-main">
          <h1 className="hero-eyebrow">
            {t('Шолу · Басты қорытынды', 'Обзор · Главный вывод')}
          </h1>
          <p className="hero-title" id="hero-title">
            {worst
              ? hard.length
                ? t(`Ең әлсіз тақырып — «${worstName}»: оны оқушылардың ${fmt(worst.mastery)}%-ы ғана меңгерген`, `Самая слабая тема — «${worstName}»: её усвоили только ${fmt(worst.mastery)}% учеников`)
                : t(`Қиын тақырып жоқ. Ең төмені — «${worstName}», ${fmt(worst.mastery)}%`, `Сложных тем нет. Ниже всех — «${worstName}», ${fmt(worst.mastery)}%`)
              : t('Барлық тақырып жақсы меңгерілген', 'Все темы усвоены хорошо')}
          </p>
          <p className="hero-sub">
            {root
              ? t(
                  `Ықтимал себебі тірек тақырыпта: «${ds.topics[root.i].name[lang]}» (${fmt(root.mastery)}%). Сағатты алдымен соған беру тиімді.`,
                  `Вероятная причина в опорной теме: «${ds.topics[root.i].name[lang]}» (${fmt(root.mastery)}%). Часы выгоднее сначала дать ей.`,
                )
              : hard.length
                ? t(`Барлығы ${hard.length} тақырып қиын, ${watch.length} тақырып назарда.`, `Всего сложных тем: ${hard.length}, в зоне риска: ${watch.length}.`)
                : watch.length
                  ? t(`Меңгеру үлесі 50%-дан төмен тақырып жоқ; ${watch.length} тақырып назарда (50–65%).`, `Тем ниже 50% нет; в зоне риска (50–65%): ${watch.length}.`)
                  : t('Барлық тақырыптың меңгеру үлесі 65%-дан жоғары.', 'У всех тем доля усвоивших выше 65%.')}
          </p>
          <div className="hero-actions">
            <button className="btn accent" onClick={() => c.go('topics')}>
              {t('Тақырыптарды ашу', 'Открыть темы')} <Icon name="arrow" size={16} />
            </button>
            <button className="btn on-dark" onClick={() => c.go('hours')}>
              <Icon name="clock" size={16} />
              {t('Сағат жоспары', 'План часов')}
            </button>
          </div>
        </div>
        <dl className="hero-stats">
          <div>
            <dt>{t('оқушы', 'учеников')}</dt>
            <dd>{ds.students.length.toLocaleString('ru-RU')}</dd>
          </div>
          <div>
            <dt>{myBook ? t('сыныптың оқулығы', 'учебник класса') : local ? t('сынып', 'классов') : t('мектеп', 'школ')}</dt>
            <dd>{myBook ?? (local ? classes : schools)}</dd>
          </div>
          <div>
            <dt>{t('тақырып', 'тем')}</dt>
            <dd>{ds.topics.length}</dd>
          </div>
          <div>
            <dt>
              {t('орташа меңгеру', 'среднее усвоение')}
              <Hint text={g.mastery} />
            </dt>
            <dd>
              {fmt(avg)}%{local && <small>{t('облыс', 'область')} {fmt(regAvg)}%</small>}
            </dd>
          </div>
        </dl>
      </section>
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
      <section className="answers">
        <article className={`card answer edge-${hard.length ? 'hard' : watch.length ? 'watch' : 'ok'}`}>
          <div className="q">
            <span className="badge">
              <Icon name="topics" />
            </span>
            {t('Қай тақырыптар қиын?', 'Какие темы сложные?')}
          </div>
          <p className="headline">
            {hard.length ? (
              <>
                <span className="c-hard">{hard.length}</span> {t('тақырып қиын', 'тем сложные')}
              </>
            ) : (
              t('Қиын тақырып жоқ', 'Сложных тем нет')
            )}
            <small>
              {t(`тағы ${watch.length} тақырып назарда`, `ещё ${watch.length} в зоне риска`)} · {t('меңгеру үлесі < 50%', 'доля усвоивших < 50%')}
              {local && ` · ${t('сынып / облыс', 'класс / область')}`}
            </small>
          </p>
          {hard.length > 0 ? (
            <ul className="rows">
              {hard.slice(0, 4).map((s) => (
                <li key={s.i}>
                  <span>{ds.topics[s.i].name[lang]}</span>
                  <b className="c-hard">
                    {fmt(s.mastery)}%{local && c.regionStats[s.i].status !== 'nodata' && <small className="muted"> / {fmt(c.regionStats[s.i].mastery)}%</small>}
                  </b>
                </li>
              ))}
            </ul>
          ) : watch.length > 0 ? (
            <>
              <p className="empty-ok">
                <Icon name="check" size={16} />
                {t('Меңгеру үлесі 50%-дан төмен тақырып жоқ. Назардағы тақырыптар:', 'Тем с долей усвоивших ниже 50% нет. Темы в зоне риска:')}
              </p>
              <ul className="rows">
                {[...watch].sort((a, b) => a.mastery - b.mastery).slice(0, 4).map((s) => (
                  <li key={s.i}>
                    <span>{ds.topics[s.i].name[lang]}</span>
                    <b className="c-watch">{fmt(s.mastery)}%</b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="empty-ok">
              <Icon name="check" size={16} />
              {t('Барлық тақырып жақсы меңгерілген (65%-дан жоғары).', 'Все темы усвоены хорошо (выше 65%).')}
            </p>
          )}
          <button className="btn ghost cta" onClick={() => c.go('topics')}>
            {t('Барлық тақырып', 'Все темы')} <Icon name="arrow" size={16} />
          </button>
        </article>

        <article className={`card answer edge-${proven.length ? 'ok' : 'watch'}`}>
          <div className="q">
            <span className="badge">
              <Icon name="book" />
            </span>
            {t('Оқулықтардың айырмасы бар ма?', 'Различаются ли учебники?')}
          </div>
          {!tb || !tb.ref ? (
            <p className="headline">{t('Салыстыруға дерек жеткіліксіз', 'Недостаточно данных для сравнения')}</p>
          ) : (
            <>
              <p className="headline">
                {proven.length ? (
                  <>
                    {t('Иә:', 'Да:')} {proven.map((r) => `${r.name} ${signed(r.adj)}`).join(', ')} {t('балл', 'балла')}
                  </>
                ) : (
                  t('Айырмашылық дәлелденбеген', 'Разница не доказана')
                )}
                <small>
                  {t(`${tb.ref}-мен салыстырғанда, мектеп құрамына түзетілген`, `относительно ${tb.ref}, с поправкой на состав школ`)}
                  {local && ` · ${t('бүкіл облыс бойынша', 'по всей области')}`}
                  <Hint text={g.adjusted} />
                </small>
              </p>
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
                    `Орташа баллды тікелей салыстырса, ${flipped.name} ${fmt(Math.abs(flipped.naive!), 1)} балл ${flipped.naive! < 0 ? 'төмен' : 'жоғары'} көрінеді. Бұл — мектептер айырмасы, оқулықтікі емес.`,
                    `При прямом сравнении средних ${flipped.name} выглядит на ${fmt(Math.abs(flipped.naive!), 1)} балла ${flipped.naive! < 0 ? 'хуже' : 'лучше'}. Это разница школ, а не учебников.`,
                  )}
                </p>
              )}
            </>
          )}
          <button className="btn ghost cta" onClick={() => c.go('textbooks')}>
            {t('Оқулықтарды салыстыру', 'Сравнение учебников')} <Icon name="arrow" size={16} />
          </button>
        </article>

        <article className={`card answer edge-${moved ? 'brand' : 'ok'}`}>
          <div className="q">
            <span className="badge">
              <Icon name="clock" />
            </span>
            {t('Сағатты қалай бөлген жөн?', 'Как распределить часы?')}
          </div>
          {moved ? (
            <>
              <p className="headline">
                {t(`${moved} сағатты жылжыту`, `Перенести ${moved} ч`)} → <span className="c-ok">{signed(eff.avg)}</span> {t('балл', 'балла')}
                <small>
                  {t(`жылдық ${c.model.total} сағат өзгермейді · орташа күтілетін өсім ± ${fmt(eff.avgHalf, 1)}`, `годовые ${c.model.total} ч не меняются · средний ожидаемый прирост ± ${fmt(eff.avgHalf, 1)}`)}
                </small>
              </p>
              <ul className="rows">
                {ups.slice(0, 4).map((m) => (
                  <li key={m.i}>
                    <span>{ds.topics[m.i].name[lang]}</span>
                    <b className="c-ok">
                      +{m.d} {t('сағ', 'ч')} · {signed(eff.per[m.i].delta)}
                    </b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="headline">
              {t('Жоспарды өзгертуге негіз жоқ', 'Оснований менять план нет')}
              <small>{t('Сағатты жылжытудың пайдасына жеткілікті дәлел табылмады.', 'Достаточных подтверждений пользы от переноса часов не найдено.')}</small>
            </p>
          )}
          <button className="btn ghost cta" onClick={() => c.go('hours')}>
            {t('Сағат жоспары', 'План часов')} <Icon name="arrow" size={16} />
          </button>
        </article>
      </section>

      {ds.synthetic && (
        <Note>
          {t(
            'Бұл демо дерегі синтетикалық: мектептер мен баллдар ойдан алынған, оқулықтар шартты түрде A, B, C, D деп аталған. Өз дерегіңізді «Дерек» бетінен CSV арқылы жүктей аласыз.',
            'Демо-данные синтетические: школы и баллы вымышлены, учебники условно названы A, B, C, D. Свои данные можно загрузить CSV-файлом на странице «Данные».',
          )}
        </Note>
      )}
    </>
  );
}
