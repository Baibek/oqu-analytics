import { mean, sum } from '../lib/stats';
import { predictEffect } from '../lib/analysis';
import { Ctx, fmt, Note, signed } from './common';

export function Overview({ c }: { c: Ctx }) {
  const { t, ds, stats, lang } = c;
  const usable = stats.filter((s) => s.status !== 'nodata');
  const hard = usable.filter((s) => s.status === 'hard').sort((a, b) => a.mastery - b.mastery);
  const watch = usable.filter((s) => s.status === 'watch');
  const schools = new Set(ds.students.map((s) => ds.units[s.unit].school)).size;

  if (!usable.length) {
    return (
      <Note kind="warn">
        {t(
          'Қорытынды жасауға дерек жеткіліксіз: әр тақырыпқа кемінде 30 оқушы мен 5 сынып тобы керек. Сүзгіні алып тастаңыз немесе көбірек дерек жүктеңіз.',
          'Данных недостаточно для выводов: по каждой теме нужно не менее 30 учеников и 5 классов. Снимите фильтр или загрузите больше данных.',
        )}
      </Note>
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
      <section className="kpis">
        <div className="kpi">
          <b>{ds.students.length}</b>
          <span>{t('оқушы', 'учеников')}</span>
        </div>
        <div className="kpi">
          <b>{schools}</b>
          <span>{t('мектеп', 'школ')}</span>
        </div>
        <div className="kpi">
          <b>{ds.topics.length}</b>
          <span>{t('тақырып', 'тем')}</span>
        </div>
        <div className="kpi">
          <b>{fmt(mean(usable.map((s) => s.mastery)))}%</b>
          <span>{t('орташа меңгеру үлесі', 'средняя доля усвоивших')}</span>
        </div>
      </section>

      <section className="cards">
        <article className="card">
          <h2>
            <span className="step">1</span>
            {t('Қай тақырыптар қиын?', 'Какие темы сложные?')}
          </h2>
          <p className="big">
            <b className="c-hard">{hard.length}</b> {t('қиын', 'сложных')}, <b className="c-watch">{watch.length}</b> {t('назарда', 'в зоне риска')}
          </p>
          {hard.length ? (
            <ul className="plain">
              {hard.slice(0, 4).map((s) => (
                <li key={s.i}>
                  <span>{ds.topics[s.i].name[lang]}</span>
                  <b>
                    {fmt(s.mastery)}% <small>({fmt(s.lo)}–{fmt(s.hi)})</small>
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('Меңгеру үлесі 50%-дан төмен тақырып жоқ.', 'Нет тем с долей усвоивших ниже 50%.')}</p>
          )}
          <button className="link" onClick={() => c.go('topics')}>
            {t('Барлық тақырып →', 'Все темы →')}
          </button>
        </article>

        <article className="card">
          <h2>
            <span className="step">2</span>
            {t('Оқулықтардың айырмасы бар ма?', 'Различаются ли учебники?')}
          </h2>
          {!tb || !tb.ref ? (
            <p>{t('Салыстыруға дерек жеткіліксіз.', 'Недостаточно данных для сравнения.')}</p>
          ) : (
            <>
              <p className="big">
                {proven.length
                  ? t(`${proven.length} оқулықта айырмашылық дәлелденді`, `Доказана разница у ${proven.length} учебника(ов)`)
                  : t('Айырмашылық дәлелденбеген', 'Разница не доказана')}
              </p>
              <ul className="plain">
                {tb.rows
                  .filter((r) => r.verdict !== 'ref')
                  .map((r) => (
                    <li key={r.name}>
                      <span>
                        {r.name} <small>{t(`${tb.ref}-ға қатысты`, `относительно ${tb.ref}`)}</small>
                      </span>
                      <b className={r.verdict === 'better' ? 'c-ok' : r.verdict === 'worse' ? 'c-hard' : 'muted'}>
                        {r.verdict === 'nodata' ? t('дерек аз', 'мало данных') : r.verdict === 'unproven' ? t('дәлелденбеген', 'не доказано') : `${signed(r.adj)} ${t('балл', 'балла')}`}
                      </b>
                    </li>
                  ))}
              </ul>
              {flipped && (
                <p className="small">
                  {t(
                    `Назар аударыңыз: орташа баллды тікелей салыстырса, ${flipped.name} ${fmt(Math.abs(flipped.naive!), 1)} балл ${flipped.naive! < 0 ? 'төмен' : 'жоғары'} көрінеді. Мектеп құрамына түзеткенде қорытынды керісінше.`,
                    `Обратите внимание: при прямом сравнении средних ${flipped.name} выглядит на ${fmt(Math.abs(flipped.naive!), 1)} балла ${flipped.naive! < 0 ? 'хуже' : 'лучше'}. С поправкой на состав школ вывод обратный.`,
                  )}
                </p>
              )}
            </>
          )}
          <button className="link" onClick={() => c.go('textbooks')}>
            {t('Оқулықтарды салыстыру →', 'Сравнение учебников →')}
          </button>
        </article>

        <article className="card">
          <h2>
            <span className="step">3</span>
            {t('Сағатты қалай бөлген жөн?', 'Как распределить часы?')}
          </h2>
          {moved ? (
            <>
              <p className="big">
                {t(`${moved} сағатты жылжыту ұсынылады`, `Рекомендуется перенести ${moved} ч`)}
                <small>
                  {' '}
                  {t('жалпы', 'из')} {c.model.total} {t('сағаттың ішінде', 'часов')}
                </small>
              </p>
              <ul className="plain">
                {ups.slice(0, 4).map((m) => (
                  <li key={m.i}>
                    <span>{ds.topics[m.i].name[lang]}</span>
                    <b className="c-ok">
                      +{m.d} {t('сағ', 'ч')} → {signed(eff.per[m.i].delta)} {t('балл', 'балла')}
                    </b>
                  </li>
                ))}
              </ul>
              <p className="small">
                {t('Барлық тақырып бойынша күтілетін орташа өсім:', 'Ожидаемый средний прирост по всем темам:')} <b>{signed(eff.avg)}</b> ± {fmt(eff.avgHalf, 1)} {t('балл', 'балла')}
              </p>
            </>
          ) : (
            <p>
              {t(
                'Сағатты жылжытудың пайдасына жеткілікті дәлел табылмады: ағымдағы жоспарды өзгертуге негіз жоқ.',
                'Достаточных оснований переносить часы не найдено: менять текущий план нет причин.',
              )}
            </p>
          )}
          <button className="link" onClick={() => c.go('hours')}>
            {t('Сағат жоспары →', 'План часов →')}
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
