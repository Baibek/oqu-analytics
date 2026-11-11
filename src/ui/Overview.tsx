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

  return (
    <>
      {head}
      <section className="kpis" aria-label={t('Негізгі көрсеткіштер', 'Ключевые показатели')}>
        <div className="card kpi">
          <div className="v">{ds.students.length.toLocaleString('ru-RU')}</div>
          <div className="l">{t('оқушы', 'учеников')}</div>
        </div>
        <div className="card kpi">
          <div className="v">{schools}</div>
          <div className="l">{t('мектеп', 'школ')}</div>
        </div>
        <div className="card kpi">
          <div className="v">{ds.topics.length}</div>
          <div className="l">{t('тақырып', 'тем')}</div>
        </div>
        <div className="card kpi">
          <div className="v">{fmt(mean(usable.map((s) => s.mastery)))}%</div>
          <div className="l">
            {t('орташа меңгеру үлесі', 'средняя доля усвоивших')}
            <Hint text={g.mastery} />
          </div>
        </div>
      </section>

      <section className="answers">
        <article className="card answer">
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
            </small>
          </p>
          {hard.length > 0 && (
            <ul className="rows">
              {hard.slice(0, 4).map((s) => (
                <li key={s.i}>
                  <span>{ds.topics[s.i].name[lang]}</span>
                  <b className="c-hard">{fmt(s.mastery)}%</b>
                </li>
              ))}
            </ul>
          )}
          <button className="btn ghost cta" onClick={() => c.go('topics')}>
            {t('Барлық тақырып', 'Все темы')} <Icon name="arrow" size={16} />
          </button>
        </article>

        <article className="card answer">
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

        <article className="card answer">
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
