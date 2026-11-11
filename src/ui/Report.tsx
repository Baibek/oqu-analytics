import { MIN_STUDENTS, MIN_UNITS, predictEffect } from '../lib/analysis';
import type { Control } from '../lib/analysis';
import type { TextbookRow } from '../lib/analysis';
import { mean, sum } from '../lib/stats';
import { Ctx, fmt, Icon, Note, Pill, signed, statusLabel, verdictLabel } from './common';
import { why } from './Hours';

const pillOf = { ref: 'nodata', better: 'ok', worse: 'hard', unproven: 'watch', nodata: 'nodata' } as const;
const pTxt = (p: number | null) => (p === null ? '—' : p < 0.001 ? '< 0,001' : fmt(p, 3));

// Браузерлердің kk-KZ пішімі әртүрлі («2026 М11 11»), сондықтан күнді өзіміз жазамыз
const MONTHS = {
  kk: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const dateText = (d: Date, lang: 'kk' | 'ru') =>
  lang === 'kk' ? `${d.getFullYear()} жылғы ${d.getDate()} ${MONTHS.kk[d.getMonth()]}` : `${d.getDate()} ${MONTHS.ru[d.getMonth()]} ${d.getFullYear()} г.`;

/** Ұсыныс: мәтін және оны растайтын сан */
interface Rec {
  text: string;
  evidence: string;
}

/** Мәтінді алмасу буферіне көшіру (ескі браузерлерде — жасырын textarea арқылы) */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Әдістемелік кеңеске апаратын басып шығарылатын есеп: кейстің төрт сұрағына бір құжатта жауап */
export function Report({ c }: { c: Ctx }) {
  const { t, ds, stats, lang, model } = c;
  const tb = c.textbooks;
  const usable = stats.filter((s) => s.status !== 'nodata');
  const noData = stats.filter((s) => s.status === 'nodata');
  const weak = usable.filter((s) => s.status !== 'ok').sort((a, b) => a.mastery - b.mastery);
  const schools = new Set(ds.students.map((s) => ds.units[s.unit].school)).size;
  const classes = new Set(ds.students.map((s) => s.unit)).size;
  const name = (i: number) => ds.topics[i].name[lang];
  const rootName = (i: number) => (stats[i].prereq?.root ? name(stats[i].prereq!.i) : null);
  const scopeText = c.scopeLabel ?? t('Жамбыл облысы', 'Жамбылская область');
  const gradeText = ds.grade ? t(`${ds.grade}-сынып`, `${ds.grade} класс`) : '';
  const subjectLine = [ds.subject[lang], gradeText, scopeText].filter(Boolean).join(' · ');
  const today = dateText(new Date(), lang);
  const avg = usable.length ? mean(usable.map((s) => s.mastery)) : NaN;

  // ---- Сағаттар ----
  const hours = c.recommended;
  const eff = predictEffect(model, hours);
  const deltas = hours.map((h, i) => h - model.topics[i].planned);
  const ups = deltas.map((d, i) => ({ i, d })).filter((m) => m.d > 0).sort((a, b) => eff.per[b.i].delta - eff.per[a.i].delta);
  const downs = deltas.map((d, i) => ({ i, d })).filter((m) => m.d < 0);
  const moved = sum(ups.map((m) => m.d));

  // ---- Оқулықтар ----
  const others = tb?.rows.filter((r) => r.verdict !== 'ref') ?? [];
  const by = (v: TextbookRow['verdict']) => others.filter((r) => r.verdict === v);
  const better = by('better').sort((a, b) => (b.adj ?? 0) - (a.adj ?? 0));
  const worse = by('worse');
  const unproven = by('unproven');
  const tbNoData = by('nodata');
  const flipped = tb?.rows.find((r) => r.flipped);
  const ctrl: Record<Control, string> = { baseline: t('бастапқы диагностика балы', 'балл входной диагностики'), urban: t('қала/ауыл', 'город/село'), lang: t('оқыту тілі', 'язык обучения'), textbook: t('оқулық', 'учебник') };
  const names = (rs: TextbookRow[]) => rs.map((r) => r.name).join(', ');
  const parts: string[] = [];
  if (better.length) parts.push(t(`${names(better)} — мәнді жоғары`, `${names(better)} — значимо выше`));
  if (worse.length) parts.push(t(`${names(worse)} — мәнді төмен`, `${names(worse)} — значимо ниже`));
  if (unproven.length) parts.push(t(`${names(unproven)} — айырма дәлелденбеген`, `${names(unproven)} — разница не доказана`));
  if (tbNoData.length) parts.push(t(`${names(tbNoData)} — дерек жеткіліксіз`, `${names(tbNoData)} — мало данных`));
  const tbVerdict = tb?.ref ? t(`${tb.ref}-мен салыстырғанда: `, `По сравнению с ${tb.ref}: `) + (parts.join('; ') || '—') + '.' : null;
  const refSchools = tb?.ref ? new Set(c.region.units.filter((u) => u.textbook === tb.ref).map((u) => u.school)).size : 0;
  const pilotN = Math.max(2, Math.min(5, Math.round(refSchools * 0.15)));

  // ---- Шешім үшін ұсыныстар: тек деректе бар сандардан ----
  const recs: Rec[] = [];
  if (ups.length) {
    const top = ups.slice(0, 2);
    const list = top.map((m) => `«${name(m.i)}» (${model.topics[m.i].planned} → ${hours[m.i]})`).join(', ');
    const many = top.length > 1;
    recs.push({
      text: t(
        `Жылдық сағатты өзгертпей, ${list} ${many ? 'тақырыптарына' : 'тақырыбына'} сағат қосу${downs.length ? `; сағатты жақсы меңгерілген ${downs.length} тақырыптан алу (4-бөлімдегі кесте)` : ''}.`,
        `Не меняя годовой объём, добавить часы ${many ? 'темам' : 'теме'} ${list}${downs.length ? `; часы взять у ${downs.length} хорошо усвоенных тем (таблица в разделе 4)` : ''}.`,
      ),
      evidence: top
        .map((m) =>
          t(
            `«${name(m.i)}»: меңгеру ${fmt(stats[m.i].mastery)}%, күтілетін өсім ${signed(eff.per[m.i].delta)} ± ${fmt(eff.per[m.i].half, 1)} балл`,
            `«${name(m.i)}»: усвоение ${fmt(stats[m.i].mastery)}%, ожидаемый рост ${signed(eff.per[m.i].delta)} ± ${fmt(eff.per[m.i].half, 1)} балла`,
          ),
        )
        .join('; '),
    });
  }
  const roots = weak.filter((s) => s.prereq?.root);
  const seenRoot = new Set<number>();
  for (const s of roots) {
    const p = s.prereq!;
    if (seenRoot.has(p.i) || seenRoot.size >= 2) continue;
    seenRoot.add(p.i);
    recs.push({
      text: t(
        `«${name(s.i)}» тақырыбын түзетпес бұрын алдымен тірек тақырыпты — «${name(p.i)}» — күшейту (қайталау сабағы, диагностикалық тапсырмалар).`,
        `Прежде чем исправлять тему «${name(s.i)}», сначала усилить опорную тему «${name(p.i)}» (повторение, диагностические задания).`,
      ),
      evidence: t(
        `«${name(p.i)}» меңгеру ${fmt(p.mastery)}%; екі тақырып нәтижесінің байланысы r = ${fmt(p.r, 2)}; «${name(s.i)}» меңгеру ${fmt(s.mastery)}%`,
        `«${name(p.i)}»: усвоение ${fmt(p.mastery)}%; связь результатов двух тем r = ${fmt(p.r, 2)}; «${name(s.i)}»: усвоение ${fmt(s.mastery)}%`,
      ),
    });
  }
  const methodical = weak.find((s) => deltas[s.i] === 0 && model.topics[s.i].evidence === 'none' && !s.prereq?.root);
  if (methodical && recs.length < 4) {
    recs.push({
      text: t(
        `«${name(methodical.i)}» тақырыбына сағат қоспай, оқыту әдістемесін және оқулықтағы бөлімді қайта қарау: қосымша сағаттың пайдасы деректе байқалмайды.`,
        `Для темы «${name(methodical.i)}» не добавлять часы, а пересмотреть методику и раздел учебника: польза дополнительных часов в данных не видна.`,
      ),
      evidence: t(
        `Меңгеру ${fmt(methodical.mastery)}% (95% СА ${fmt(methodical.lo)}–${fmt(methodical.hi)}), ${methodical.n} оқушы`,
        `Усвоение ${fmt(methodical.mastery)}% (95% ДИ ${fmt(methodical.lo)}–${fmt(methodical.hi)}), ${methodical.n} учеников`,
      ),
    });
  }
  if (tb?.ref) {
    const b = better[0];
    const w = worse[0];
    if (b && b.adj !== null) {
      recs.push({
        text: t(
          `«${b.name}»: бірден көшпей, алдымен «${tb.ref}» қолданатын ${refSchools} мектептің ${pilotN}-інде бір оқу жылы пилот өткізу және нәтижені қайта салыстыру.`,
          `«${b.name}»: не переходить сразу, а сначала провести пилот на один учебный год в ${pilotN} из ${refSchools} школ, работающих по «${tb.ref}», и повторить сравнение.`,
        ),
        evidence: t(
          `Түзетілген әсер ${signed(b.adj)} балл (95% СА ${signed(b.lo)}…${signed(b.hi)}, p ${pTxt(b.p)}, ${signed(b.sdUnits, 2)} SD)`,
          `Эффект с поправкой ${signed(b.adj)} балла (95% ДИ ${signed(b.lo)}…${signed(b.hi)}, p ${pTxt(b.p)}, ${signed(b.sdUnits, 2)} SD)`,
        ),
      });
    } else if (w && w.adj !== null) {
      recs.push({
        text: t(
          `«${w.name}» қолданатын мектептерге қосымша әдістемелік қолдау көрсету; оқулықты ауыстыру мәселесін пилоттан кейін қарау.`,
          `Школам, работающим по «${w.name}», оказать методическую поддержку; вопрос о смене учебника рассмотреть после пилота.`,
        ),
        evidence: t(
          `${tb.ref}-ға қатысты түзетілген әсер ${signed(w.adj)} балл (95% СА ${signed(w.lo)}…${signed(w.hi)}, p ${pTxt(w.p)})`,
          `Эффект с поправкой относительно ${tb.ref}: ${signed(w.adj)} балла (95% ДИ ${signed(w.lo)}…${signed(w.hi)}, p ${pTxt(w.p)})`,
        ),
      });
    } else if (unproven.length) {
      recs.push({
        text: t('Оқулықты ауыстыру туралы шешім қабылдамау: қазіргі деректе оқулықтар арасындағы айырма дәлелденбеген.', 'Не принимать решение о смене учебника: в текущих данных разница между учебниками не доказана.'),
        evidence: unproven.map((r) => `${r.name}: ${signed(r.adj)} (p ${pTxt(r.p)})`).join('; '),
      });
    }
  }
  if (recs.length < 5 && (noData.length || !ds.hasBaseline)) {
    recs.push({
      text: !ds.hasBaseline
        ? t('Келесі оқу жылында оқушылардың бастапқы диагностика балын жинау: онсыз оқулық әсерін дәлелдеу мүмкін емес.', 'В следующем учебном году собрать балл входной диагностики: без него эффект учебника доказать нельзя.')
        : t(`${noData.length} тақырып бойынша қосымша тест дерегін жинау.`, `Собрать дополнительные данные тестирования по ${noData.length} темам.`),
      evidence: !ds.hasBaseline
        ? t('Деректе бастапқы деңгей жоқ', 'В данных нет входного уровня')
        : t(`Қорытындыға кемінде ${MIN_STUDENTS} оқушы мен ${MIN_UNITS} сынып керек`, `Для вывода нужно не менее ${MIN_STUDENTS} учеников и ${MIN_UNITS} классов`),
    });
  }
  if (recs.length < 5 && moved > 0) {
    recs.push({
      text: t('Өзгерістің нәтижесін келесі тест кезеңінде осы есеппен қайта тексеру.', 'Проверить результат изменений этим же отчётом после следующего цикла тестирования.'),
      evidence: t(`Күтілетін орташа өзгеріс ${signed(eff.avg)} ± ${fmt(eff.avgHalf, 1)} балл (${moved} сағат жылжытылды)`, `Ожидаемое среднее изменение ${signed(eff.avg)} ± ${fmt(eff.avgHalf, 1)} балла (перенесено часов: ${moved})`),
    });
  }

  // ---- Қиын бөлімдер: қарапайым сөйлемдер ----
  const hardLines = weak.map((s) => {
    const base = t(
      `«${name(s.i)}» (${ds.topics[s.i].section[lang]}): оқушылардың ${fmt(s.mastery)}%-ы меңгерген (95% СА ${fmt(s.lo)}–${fmt(s.hi)}), мәртебесі — «${statusLabel(s.status, t).toLowerCase()}».`,
      `«${name(s.i)}» (${ds.topics[s.i].section[lang]}): усвоили ${fmt(s.mastery)}% учеников (95% ДИ ${fmt(s.lo)}–${fmt(s.hi)}), статус — «${statusLabel(s.status, t).toLowerCase()}».`,
    );
    const p = s.prereq;
    const cause = p?.root
      ? t(
          ` Ықтимал себебі — тірек тақырып «${name(p.i)}»: оны ${fmt(p.mastery)}% меңгерген, нәтижелер байланысы r = ${fmt(p.r, 2)}.`,
          ` Вероятная причина — опорная тема «${name(p.i)}»: её усвоили ${fmt(p.mastery)}%, связь результатов r = ${fmt(p.r, 2)}.`,
        )
      : model.topics[s.i].evidence === 'none'
        ? t(' Тірек тақырыппен тығыз байланыс табылмады; сағат санымен де байланыс байқалмайды — себебін әдістемеден іздеген жөн.', ' Тесной связи с опорной темой не найдено; связи с числом часов тоже нет — причину стоит искать в методике.')
        : t(` Тірек тақырыппен тығыз байланыс табылмады; сағаты көп сыныптарда нәтиже жоғары (+1 сағат ≈ ${signed(model.topics[s.i].perHour)} балл).`, ` Тесной связи с опорной темой не найдено; в классах с большим числом часов результат выше (+1 час ≈ ${signed(model.topics[s.i].perHour)} балла).`);
    return base + cause;
  });

  const caveats: string[] = [];
  if (tb?.ref) {
    caveats.push(t(`Түзету факторлары: ${tb.controls.map((x) => ctrl[x]).join(', ') || '—'}. Стандарт қателер мектеп деңгейінде кластерленген.`, `Поправка на: ${tb.controls.map((x) => ctrl[x]).join(', ') || '—'}. Стандартные ошибки кластеризованы по школам.`));
    if (flipped)
      caveats.push(
        t(
          `Қарапайым салыстыру адастырады: ${flipped.name} орташа баллы бойынша ${signed(flipped.naive)} балл, ал бастапқы деңгейі бірдей оқушыларда ${signed(flipped.adj)} балл. Айырма мектептер құрамынан туындайды.`,
          `Простое сравнение вводит в заблуждение: по среднему баллу у ${flipped.name} ${signed(flipped.naive)} балла, а у учеников с одинаковым входным уровнем ${signed(flipped.adj)} балла. Разница возникает из-за состава школ.`,
        ),
      );
    if (!ds.hasBaseline) caveats.push(t('Деректе бастапқы деңгей жоқ, сондықтан айырма оқулыққа таңылмайды.', 'В данных нет входного уровня, поэтому разница не приписывается учебнику.'));
    caveats.push(
      t(
        'Халықаралық зерттеулерде оқулықтар арасындағы айырма әдетте шағын (0,03–0,08 SD). Дерек бақылаулық: мұғалім біліктілігі сияқты есепке алынбаған факторлар әсер етуі мүмкін.',
        'В международных исследованиях разница между учебниками обычно мала (0,03–0,08 SD). Данные наблюдательные: могут влиять неучтённые факторы, например квалификация учителя.',
      ),
    );
    if (c.scopeLabel) caveats.push(t('Оқулықтар бүкіл облыс деректерімен салыстырылды: бір мектептің дерегі әділ салыстыруға жеткіліксіз.', 'Учебники сравнены по данным всей области: данных одной школы для честного сравнения недостаточно.'));
  }

  // ---- Көшіруге арналған қысқа мәтін ----
  const summary = () => {
    const L: string[] = [];
    L.push(t('ӘДІСКЕР ЕСЕБІ', 'ОТЧЁТ МЕТОДИСТА'), subjectLine, `${t('Күні', 'Дата')}: ${today}`);
    L.push(`${t('Дерек', 'Данные')}: ${ds.students.length} ${t('оқушы', 'учеников')}, ${schools} ${t('мектеп', 'школ')}, ${classes} ${t('сынып', 'классов')}${ds.synthetic ? ` (${t('синтетикалық', 'синтетические')})` : ''}`);
    L.push('', `1. ${t('Тақырып нәтижелері', 'Результаты по темам')}: ${t('орташа меңгеру', 'среднее усвоение')} ${fmt(avg)}%, ${t('қиын', 'сложных')} ${usable.filter((s) => s.status === 'hard').length}, ${t('назарда', 'в зоне риска')} ${usable.filter((s) => s.status === 'watch').length}.`);
    L.push('', `2. ${t('Қиын бөлімдер', 'Сложные разделы')}:`);
    if (hardLines.length) hardLines.forEach((l) => L.push(`- ${l}`));
    else L.push(`- ${t('Қиын тақырып жоқ.', 'Сложных тем нет.')}`);
    L.push('', `3. ${t('Оқулықтар', 'Учебники')}: ${tbVerdict ?? t('дерек жеткіліксіз', 'мало данных')}`);
    L.push('', `4. ${t('Сағаттар', 'Часы')}: ${moved} ${t('сағат жылжытылады, күтілетін орташа өзгеріс', 'ч. переносится, ожидаемое среднее изменение')} ${signed(eff.avg)} ± ${fmt(eff.avgHalf, 1)} ${t('балл', 'балла')}.`);
    [...ups, ...downs].forEach((m) => L.push(`- ${name(m.i)}: ${model.topics[m.i].planned} → ${hours[m.i]} (${signed(m.d, 0)})`));
    L.push('', `5. ${t('Шешім үшін ұсыныстар', 'Рекомендации для решения')}:`);
    recs.forEach((r, k) => L.push(`${k + 1}. ${r.text} [${r.evidence}]`));
    return L.join('\n');
  };

  const statusCount = (st: string) => usable.filter((s) => s.status === st).length;

  return (
    <article className="report" aria-labelledby="report-title">
      <header className="report-head">
        <div className="report-head-top">
          <div>
            <p className="report-kicker">Oqu Analytics · {t('Әдістемелік кеңеске', 'Для методического совета')}</p>
            <h1 id="report-title">{t('Әдіскер есебі: оқу бағдарламасының нәтижелілігі', 'Отчёт методиста: результативность учебной программы')}</h1>
            <p className="report-sub">{subjectLine}</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={async () => c.notify((await copyText(summary())) ? t('Қысқаша есеп көшірілді', 'Краткий отчёт скопирован') : t('Көшіру мүмкін болмады', 'Не удалось скопировать'))}>
              <Icon name="copy" size={16} />
              {t('Көшіру', 'Копировать')}
            </button>
            <button className="btn primary" onClick={() => window.print()}>
              <Icon name="print" size={16} />
              {t('Басып шығару / PDF', 'Печать / PDF')}
            </button>
          </div>
        </div>
        <dl className="report-meta">
          <div>
            <dt>{t('Күні', 'Дата')}</dt>
            <dd>{today}</dd>
          </div>
          <div>
            <dt>{t('Аясы', 'Охват')}</dt>
            <dd>{scopeText}</dd>
          </div>
          <div>
            <dt>{t('Дерек көлемі', 'Объём данных')}</dt>
            <dd className="tnum">
              {ds.students.length.toLocaleString('ru-RU')} {t('оқушы', 'учеников')} · {schools} {t('мектеп', 'школ')} · {classes} {t('сынып', 'классов')}
            </dd>
          </div>
          <div>
            <dt>{t('Дереккөз', 'Источник')}</dt>
            <dd>{ds.synthetic ? <span className="pill pill-synth">{t('Синтетикалық дерек', 'Синтетические данные')}</span> : t('Жүктелген дерек', 'Загруженные данные')}</dd>
          </div>
        </dl>
      </header>

      {!usable.length && (
        <Note kind="warn">
          {t(
            'Қорытынды жасауға дерек жеткіліксіз: облыс бойынша әр тақырыпқа кемінде 30 оқушы мен 5 сынып, бір мектепте кемінде 10 оқушы керек.',
            'Данных недостаточно для выводов: по области нужно не менее 30 учеников и 5 классов на тему, в одной школе — не менее 10 учеников.',
          )}
        </Note>
      )}

      <section className="report-sec" aria-labelledby="rs1">
        <h2 id="rs1">1. {t('Тақырыптар бойынша нәтиже', 'Результаты по темам')}</h2>
        <p>
          {t(
            `Орташа меңгеру — ${fmt(avg)}%. Қиын тақырып: ${statusCount('hard')}, назардағы: ${statusCount('watch')}, қалыпты: ${statusCount('ok')}${noData.length ? `, дерегі жеткіліксіз: ${noData.length}` : ''}. Меңгеру — 50 және одан жоғары балл алған оқушылар үлесі; жақшада 95% сенім аралығы.`,
            `Среднее усвоение — ${fmt(avg)}%. Сложных тем: ${statusCount('hard')}, в зоне риска: ${statusCount('watch')}, в норме: ${statusCount('ok')}${noData.length ? `, мало данных: ${noData.length}` : ''}. Усвоение — доля учеников, набравших 50 баллов и выше; в скобках 95% доверительный интервал.`,
          )}
        </p>
        <div className="card tablecard" tabIndex={0} role="region" aria-label={t('Тақырыптар кестесі', 'Таблица тем')}>
          <table className="report-table">
            <caption className="sr-only">{t('Тақырыптар бойынша меңгеру', 'Усвоение по темам')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('Тақырып', 'Тема')}</th>
                <th scope="col">{t('Бөлім', 'Раздел')}</th>
                <th scope="col" className="num">{t('Меңгеру', 'Усвоение')}</th>
                <th scope="col" className="num">95% {t('СА', 'ДИ')}</th>
                <th scope="col" className="num">{t('Оқушы', 'Учеников')}</th>
                <th scope="col">{t('Мәртебе', 'Статус')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.i}>
                  <th scope="row">{name(s.i)}</th>
                  <td>{ds.topics[s.i].section[lang]}</td>
                  <td className="num">
                    <b>{fmt(s.mastery)}%</b>
                  </td>
                  <td className="num muted">{s.status === 'nodata' ? '—' : `${fmt(s.lo)}–${fmt(s.hi)}`}</td>
                  <td className="num">{s.n}</td>
                  <td>
                    <Pill kind={s.status}>
                      {s.borderline ? '≈ ' : ''}
                      {statusLabel(s.status, t)}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-sec report-break" aria-labelledby="rs2">
        <h2 id="rs2">2. {t('Қиын бөлімдер және ықтимал себептері', 'Сложные разделы и вероятные причины')}</h2>
        {hardLines.length ? (
          <ul className="report-list">
            {hardLines.map((l, k) => (
              <li key={k}>{l}</li>
            ))}
          </ul>
        ) : (
          <p>{t('Барлық тақырып «қалыпты» деңгейде: меңгеру 65%-дан жоғары.', 'Все темы «в норме»: усвоение выше 65%.')}</p>
        )}
      </section>

      <section className="report-sec report-break" aria-labelledby="rs3">
        <h2 id="rs3">3. {t('Оқулықтарды салыстыру', 'Сравнение учебников')}</h2>
        {!tb?.ref ? (
          <p>
            {t(
              `Салыстыруға дерек жеткіліксіз: әр оқулыққа кемінде ${MIN_STUDENTS} оқушы мен ${MIN_UNITS} сынып тобы керек.`,
              `Недостаточно данных для сравнения: на каждый учебник нужно не менее ${MIN_STUDENTS} учеников и ${MIN_UNITS} классов.`,
            )}
          </p>
        ) : (
          <>
            <p className="report-verdict">{tbVerdict}</p>
            <div className="card tablecard" tabIndex={0} role="region" aria-label={t('Оқулықтар кестесі', 'Таблица учебников')}>
              <table className="report-table">
                <caption className="sr-only">{t('Оқулықтардың түзетілген әсері', 'Эффект учебников с поправкой')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('Оқулық', 'Учебник')}</th>
                    <th scope="col" className="num">{t('Оқушы', 'Учеников')}</th>
                    <th scope="col" className="num">{t('Түзетілген әсер, балл', 'Эффект с поправкой, балл')}</th>
                    <th scope="col" className="num">95% {t('СА', 'ДИ')}</th>
                    <th scope="col" className="num">p</th>
                    <th scope="col">{t('Қорытынды', 'Вывод')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tb.rows.map((r) => (
                    <tr key={r.name}>
                      <th scope="row">{r.name}</th>
                      <td className="num">{r.n}</td>
                      <td className="num">{r.verdict === 'ref' || r.adj === null ? '—' : <b>{signed(r.adj)}</b>}</td>
                      <td className="num muted">{r.verdict === 'ref' || r.adj === null ? '—' : `${signed(r.lo)}…${signed(r.hi)}`}</td>
                      <td className="num">{r.verdict === 'ref' ? '—' : pTxt(r.p)}</td>
                      <td>
                        <Pill kind={pillOf[r.verdict]}>{verdictLabel(r.verdict, t)}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="report-list small">
              {caveats.map((x, k) => (
                <li key={k}>{x}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="report-sec report-break" aria-labelledby="rs4">
        <h2 id="rs4">4. {t('Оқу сағаттарын бөлу ұсынысы', 'Рекомендация по распределению часов')}</h2>
        <p>
          {moved
            ? t(
                `Жылдық ${model.total} сағат сақталады; ${moved} сағат жылжытылады. Барлық тақырып бойынша күтілетін орташа өзгеріс: ${signed(eff.avg)} ± ${fmt(eff.avgHalf, 1)} балл.`,
                `Годовой объём ${model.total} ч сохраняется; переносится ${moved} ч. Ожидаемое среднее изменение по всем темам: ${signed(eff.avg)} ± ${fmt(eff.avgHalf, 1)} балла.`,
              )
            : t(`Жылдық ${model.total} сағат. Деректе сағатты жылжытудың пайдасына жеткілікті дәлел жоқ, сондықтан жоспар өзгертілмейді.`, `Годовой объём ${model.total} ч. В данных нет достаточных подтверждений пользы переноса часов, поэтому план не меняется.`)}
        </p>
        <div className="card tablecard" tabIndex={0} role="region" aria-label={t('Сағаттар кестесі', 'Таблица часов')}>
          <table className="report-table report-hours">
            <caption className="sr-only">{t('Сағат жоспары және ұсыныс', 'План часов и рекомендация')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('Тақырып', 'Тема')}</th>
                <th scope="col" className="num">{t('Жоспар → ұсыныс', 'План → рекомендация')}</th>
                <th scope="col" className="num">Δ</th>
                <th scope="col" className="num">{t('Күтілетін өзгеріс, балл', 'Ожидаемое изменение, балл')}</th>
                <th scope="col">{t('Негіздеме', 'Обоснование')}</th>
              </tr>
            </thead>
            <tbody>
              {ds.topics.map((tp, i) => {
                const d = deltas[i];
                return (
                  <tr key={tp.id} className={d ? 'changed' : ''}>
                    <th scope="row">{tp.name[lang]}</th>
                    <td className="num">
                      {tp.planned} → <b>{hours[i]}</b>
                    </td>
                    <td className="num">
                      <span className={`delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'zero'}`}>{d === 0 ? '0' : signed(d, 0)}</span>
                    </td>
                    <td className="num">{d === 0 ? <span className="muted">—</span> : `${signed(eff.per[i].delta)} ± ${fmt(eff.per[i].half, 1)}`}</td>
                    <td className="report-why">{why(t, stats[i], model.topics[i], d, rootName(i))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small">
          {t(
            'Әр тақырып жоспардан ±30%-дан аспайды; сағат тек «қалыпты» тақырыптан алынады. Болжам сыныптар арасындағы нақты сағат айырмасына сүйенеді (бақылаулық дерек).',
            'Каждая тема меняется не более чем на ±30% от плана; часы берутся только у тем «в норме». Прогноз опирается на фактические различия часов между классами (наблюдательные данные).',
          )}
          {c.scopeLabel && ' ' + t('Қосымша сағаттың әсері бүкіл облыс деректерінен бағаланды.', 'Эффект дополнительного часа оценён по данным всей области.')}
        </p>
      </section>

      <section className="report-sec report-break" aria-labelledby="rs5">
        <h2 id="rs5">5. {t('Шешім үшін ұсыныстар', 'Рекомендации для решения')}</h2>
        {recs.length ? (
          <ol className="report-recs">
            {recs.slice(0, 5).map((r, k) => (
              <li key={k}>
                <p>{r.text}</p>
                <p className="report-evidence">
                  <b>{t('Дәлел:', 'Основание:')}</b> {r.evidence}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>{t('Деректе өзгерісті қажет ететін дәлел табылмады: қазіргі жоспарды сақтау.', 'В данных не найдено оснований для изменений: сохранить текущий план.')}</p>
        )}
        {ds.synthetic && <p className="small">{t('Ескерту: есеп синтетикалық демо дерегімен жасалған.', 'Примечание: отчёт построен на синтетических демо-данных.')}</p>}

        <div className="report-sign">
          <h3>{t('Әдістемелік кеңес шешімі', 'Решение методического совета')}</h3>
          <div className="sign-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="sign-row">
            <div>
              <span className="sign-line" />
              <small>{t('Күні', 'Дата')}</small>
            </div>
            <div>
              <span className="sign-line" />
              <small>{t('Төрағаның қолы', 'Подпись председателя')}</small>
            </div>
            <div>
              <span className="sign-line" />
              <small>{t('Хатшының қолы', 'Подпись секретаря')}</small>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
