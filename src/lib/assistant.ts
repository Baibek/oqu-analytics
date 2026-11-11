import type { Dataset, Lang } from './types';
import type { HourModel, TextbookResult, TopicStat } from './analysis';
import { MIN_LOCAL, PASS, predictEffect, schoolIndex } from './analysis';
import { mean } from './stats';

// ИИ көмекшінің кірістірілген (офлайн) талдаушысы. Ол сұрақтың мағынасын кілт сөздер
// арқылы анықтап, сайтта есептелген нақты сандармен жауап береді. Ойдан ештеңе қоспайды:
// дерек болмаса, соны айтады. Claude режимі қосылса, осы контекст модельге беріледі.

export type AssistTab = 'overview' | 'topics' | 'textbooks' | 'hours' | 'data';

export interface AssistAction {
  label: string;
  tab?: AssistTab;
  /** Мектепті (және сыныпты) таңдау */
  scope?: { school: string | null; unit: string | null };
  /** Тақырыпты ашу (индекс) */
  topic?: number;
}

export interface AssistReply {
  text: string[];
  actions: AssistAction[];
}

export interface AssistContext {
  lang: Lang;
  /** Таңдалған аяның дерегі */
  ds: Dataset;
  /** Бүкіл облыс */
  region: Dataset;
  stats: TopicStat[];
  regionStats: TopicStat[];
  textbooks: TextbookResult | null;
  model: HourModel;
  recommended: number[];
  scopeLabel: string | null;
}

const f = (x: number | null | undefined, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(d).replace('.', ',').replace('-', '−'));
const sg = (x: number | null | undefined, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? '—' : (x > 0 ? '+' : '') + f(x, d));

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"“”.,!?;:()]/g, ' ');

const SHORT_STOP = new Set(['и', 'в', 'на', 'не', 'ең', 'мен', 'бар', 'ма', 'ме', 'қай', 'как', 'что', 'это', 'по', 'из', 'за', 'да', 'жоқ', 'ол', 'бұл', 'со', 'от', 'до', 'а', 'же', 'ли', 'бе', 'пе']);

/**
 * Сөз түбірі: қазақ/орыс жалғауларына қарамай салыстыру үшін ұзын сөздің алғашқы 5 әрпі.
 * «Ом», «ПӘК» сияқты қысқа терминдер толық сақталады.
 */
const stems = (s: string) =>
  norm(s)
    .split(/[\s–—-]+/)
    .filter((w) => (w.length >= 4 ? true : w.length >= 2 && !SHORT_STOP.has(w)))
    .map((w) => (w.length >= 4 ? w.slice(0, 5) : w));

const STOP = new Set(['тақыр', 'тема', 'темы', 'қалай', 'какие', 'какой', 'неге', 'почем', 'бойын', 'турал', 'қанда', 'жоспа', 'және', 'үшін', 'для', 'при', 'оның', 'қиын', 'сложн', 'трудн']);

/** Сұрақта аталған тақырыпты табу */
export function matchTopic(q: string, ds: Dataset, lang: Lang): number | null {
  const qs = new Set(stems(q).filter((w) => !STOP.has(w)));
  let best: { i: number; score: number } | null = null;
  ds.topics.forEach((t, i) => {
    const ts = [...new Set([...stems(t.name.kk), ...stems(t.name.ru)])].filter((w) => !STOP.has(w));
    const hit = ts.filter((w) => qs.has(w)).length;
    if (!hit) return;
    // Атаудағы сөздердің қаншасы аталғаны: «Ом заңы» сияқты қысқа атауларға әділ
    const score = hit / Math.max(2, Math.min(ts.length, 4)) + hit * 0.01;
    if (!best || score > best.score) best = { i, score };
  });
  const b = best as { i: number; score: number } | null;
  return b && b.score >= 0.5 && lang ? b.i : null;
}

export interface Ranked {
  school: string;
  unit: string | null;
  mastery: number;
  n: number;
}

/** Мектептер немесе сыныптар рейтингі: барлық тақырып бойынша меңгеру үлесі */
export function rankUnits(ds: Dataset, by: 'school' | 'class'): Ranked[] {
  const sch = schoolIndex(ds);
  const key = (u: number) => (by === 'school' ? String(sch[u]) : String(u));
  const acc = new Map<string, { pass: number; cnt: number; students: Set<string>; u: number }>();
  for (const s of ds.students) {
    const k = key(s.unit);
    let a = acc.get(k);
    if (!a) acc.set(k, (a = { pass: 0, cnt: 0, students: new Set(), u: s.unit }));
    a.students.add(s.id);
    for (const v of s.scores) {
      if (Number.isNaN(v)) continue;
      a.cnt++;
      if (v >= PASS) a.pass++;
    }
  }
  return [...acc.values()]
    .filter((a) => a.students.size >= MIN_LOCAL && a.cnt > 0)
    .map((a) => ({ school: ds.units[a.u].school, unit: by === 'class' ? ds.units[a.u].name || null : null, mastery: (100 * a.pass) / a.cnt, n: a.students.size }))
    .sort((x, y) => x.mastery - y.mastery);
}

const has = (q: string, re: RegExp) => re.test(q);

export function answer(question: string, c: AssistContext): AssistReply {
  const { lang, ds, stats, model } = c;
  const t = (kk: string, ru: string) => (lang === 'kk' ? kk : ru);
  const q = norm(question);
  const name = (i: number) => ds.topics[i].name[lang];
  const usable = stats.filter((s) => s.status !== 'nodata');
  const where = c.scopeLabel ?? t('облыс бойынша', 'по области');

  if (!usable.length) {
    return {
      text: [t('Таңдалған ая бойынша қорытынды жасауға дерек жеткіліксіз. Мектепті немесе сүзгіні өзгертіп көріңіз.', 'Для выбранной выборки данных недостаточно. Попробуйте другую школу или снимите фильтр.')],
      actions: [{ label: t('Дерек жүктеу', 'Загрузить данные'), tab: 'data' }],
    };
  }

  // 1. Терминдер
  if (has(q, /сенім аралы|доверител|\bси\b|\bди\b|confidence/)) {
    return {
      text: [
        t(
          '95% сенім аралығы — нақты мәннің 95% ықтималдықпен жататын аралығы. Мысалы, «35% (29–41)» дегеніміз: меңгеру үлесі шамамен 29–41% аралығында. Дерек аз болса, аралық кеңейеді.',
          '95% доверительный интервал — диапазон, где истинное значение лежит с вероятностью 95%. Например, «35% (29–41)»: доля усвоивших примерно от 29 до 41%. Чем меньше данных, тем он шире.',
        ),
        t('Облыс бойынша аралық мектептерді қайта іріктеу арқылы есептеледі, себебі бір мектептің оқушылары тәуелсіз емес.', 'По области интервал считается перевыборкой школ, так как ученики одной школы не независимы.'),
      ],
      actions: [],
    };
  }
  if (has(q, /p-м|p-зн|p мән|p знач|мәнді|значим/)) {
    return {
      text: [
        t(
          'p-мән — айырмашылық шын мәнінде жоқ болса, мұндай нәтиженің кездейсоқ шығу ықтималдығы. p < 0,05 болса, айырма «мәнді» деп саналады. Біз айырма мәнді болмаса, оны ашық «дәлелденбеген» деп жазамыз.',
          'p-значение — вероятность получить такой результат случайно, если разницы на самом деле нет. При p < 0,05 разница считается «значимой». Если разница незначима, мы прямо пишем «не доказана».',
        ),
      ],
      actions: [],
    };
  }
  if (has(q, /\bsd\b|стандарт ауыт|стандартн/)) {
    return {
      text: [
        t(
          'SD — оқушылар арасындағы әдеттегі айырма. Оқулық әсерін SD бірлігінде көрсетеміз: 0,1 SD — шағын, 0,3 SD — байқалатын әсер. Халықаралық зерттеулерде оқулықтар айырмасы әдетте 0,03–0,08 SD.',
          'SD — обычный разброс между учениками. Эффект учебника показываем в SD: 0,1 SD — малый, 0,3 SD — заметный. В международных исследованиях разница учебников обычно 0,03–0,08 SD.',
        ),
      ],
      actions: [],
    };
  }

  const isHours = has(q, /сағат|час|уақыт|время|бөлу|бөлген|распредел/);
  const isBook = has(q, /оқулық|оқулы|учебник|кітап|книг/);
  const isWhy = has(q, /неге|себеп|почему|причин/);
  const topic = matchTopic(question, ds, lang);

  // 2. Нақты тақырып
  if (topic !== null && !isBook) {
    const s = stats[topic];
    const h = model.topics[topic];
    const reg = c.regionStats[topic];
    const rec = c.recommended[topic];
    const tp = ds.topics[topic];
    const lines: string[] = [];
    if (s.status === 'nodata') {
      lines.push(t(`«${name(topic)}» бойынша дерек жеткіліксіз (${s.n} оқушы).`, `По теме «${name(topic)}» данных недостаточно (${s.n} учеников).`));
    } else {
      const st = { hard: t('қиын', 'сложная'), watch: t('назарда', 'в зоне риска'), ok: t('қалыпты', 'в норме'), nodata: '' }[s.status];
      lines.push(
        t(
          `«${name(topic)}» (${where}): оқушылардың ${f(s.mastery)}%-ы меңгерген (95% СА ${f(s.lo)}–${f(s.hi)}), ${s.n} оқушы. Мәртебесі: ${st}.`,
          `«${name(topic)}» (${where}): усвоили ${f(s.mastery)}% учеников (95% ДИ ${f(s.lo)}–${f(s.hi)}), ${s.n} учеников. Статус: ${st}.`,
        ),
      );
      if (c.scopeLabel && reg.status !== 'nodata') lines.push(t(`Облыс бойынша — ${f(reg.mastery)}% (айырма ${sg(s.mastery - reg.mastery, 0)} п.п.).`, `По области — ${f(reg.mastery)}% (разница ${sg(s.mastery - reg.mastery, 0)} п.п.).`));
      if (s.prereq) {
        lines.push(
          s.prereq.root
            ? t(
                `Ықтимал себебі тірек тақырыпта: «${name(s.prereq.i)}» тек ${f(s.prereq.mastery)}% меңгерілген, ал нәтижелер байланысы r = ${f(s.prereq.r, 2)}. Алдымен соны күшейткен жөн.`,
                `Вероятная причина в опорной теме: «${name(s.prereq.i)}» усвоена лишь на ${f(s.prereq.mastery)}%, связь результатов r = ${f(s.prereq.r, 2)}. Сначала стоит усилить её.`,
              )
            : t(`Тірек тақырып «${name(s.prereq.i)}» жақсы меңгерілген (${f(s.prereq.mastery)}%), себеп басқа жерде болуы мүмкін.`, `Опорная тема «${name(s.prereq.i)}» усвоена хорошо (${f(s.prereq.mastery)}%), причина, вероятно, в другом.`),
        );
      } else if (isWhy) {
        lines.push(t('Бұл тақырыптың тірек тақырыбы көрсетілмеген, сондықтан себепті деректен анықтау мүмкін емес.', 'Опорная тема не указана, поэтому причину по данным определить нельзя.'));
      }
      lines.push(
        h.evidence === 'none'
          ? t('Сағаты көп сыныптарда нәтиже жоғары екені байқалмайды: қосымша сағаттың пайдасы дәлелденбеген.', 'В классах с большим числом часов результат не выше: польза дополнительных часов не подтверждена.')
          : t(`+1 сағат ≈ ${sg(h.perHour)} балл. Жоспарда ${tp.planned} сағат, ұсыныс — ${rec} сағат.`, `+1 час ≈ ${sg(h.perHour)} балла. По плану ${tp.planned} ч, рекомендация — ${rec} ч.`),
      );
    }
    return { text: lines, actions: [{ label: t('Тақырыпты ашу', 'Открыть тему'), tab: 'topics', topic }] };
  }

  // 3. Сағаттар
  if (isHours) {
    const eff = predictEffect(model, c.recommended);
    const moves = c.recommended.map((h, i) => ({ i, d: h - model.topics[i].planned })).filter((m) => m.d !== 0);
    const ups = moves.filter((m) => m.d > 0).sort((a, b) => eff.per[b.i].delta - eff.per[a.i].delta);
    const downs = moves.filter((m) => m.d < 0);
    if (!ups.length) {
      return {
        text: [t(`Жоспарды өзгертуге негіз жоқ (${where}): сағатты жылжытудың пайдасына жеткілікті дәлел табылмады.`, `Оснований менять план нет (${where}): достаточных подтверждений пользы от переноса часов не найдено.`)],
        actions: [{ label: t('Сағат жоспары', 'План часов'), tab: 'hours' }],
      };
    }
    return {
      text: [
        t(
          `Жылдық ${model.total} сағатты өзгертпей, ${ups.reduce((a, m) => a + m.d, 0)} сағатты жылжытуды ұсынамын. Күтілетін орташа өсім: ${sg(eff.avg, 2)} ± ${f(eff.avgHalf, 2)} балл.`,
          `Не меняя годовые ${model.total} ч, рекомендую перенести ${ups.reduce((a, m) => a + m.d, 0)} ч. Ожидаемый средний прирост: ${sg(eff.avg, 2)} ± ${f(eff.avgHalf, 2)} балла.`,
        ),
        t('Қосу:', 'Добавить:') + ' ' + ups.slice(0, 4).map((m) => `«${name(m.i)}» +${m.d} (${sg(eff.per[m.i].delta)})`).join('; ') + '.',
        downs.length ? t('Азайту (жақсы меңгерілген тақырыптар):', 'Сократить (хорошо усвоенные темы):') + ' ' + downs.slice(0, 4).map((m) => `«${name(m.i)}» ${m.d}`).join('; ') + '.' : '',
      ].filter(Boolean),
      actions: [{ label: t('Сағат жоспарын ашу', 'Открыть план часов'), tab: 'hours' }],
    };
  }

  // 4. Оқулықтар
  if (isBook) {
    const tb = c.textbooks;
    if (!tb || !tb.ref) return { text: [t('Оқулықтарды салыстыруға дерек жеткіліксіз.', 'Данных для сравнения учебников недостаточно.')], actions: [] };
    const rows = tb.rows.filter((r) => r.verdict !== 'ref');
    const lines = [
      t(`${tb.ref}-мен салыстырғанда (облыс бойынша, мектеп құрамына түзетілген):`, `По сравнению с ${tb.ref} (по области, с поправкой на состав школ):`),
      ...rows.map((r) =>
        r.verdict === 'better' || r.verdict === 'worse'
          ? t(`• ${r.name}: ${sg(r.adj)} балл (95% СА ${sg(r.lo)}…${sg(r.hi)}, ${sg(r.sdUnits, 2)} SD) — мәнді ${r.verdict === 'better' ? 'жоғары' : 'төмен'}.`, `• ${r.name}: ${sg(r.adj)} балла (95% ДИ ${sg(r.lo)}…${sg(r.hi)}, ${sg(r.sdUnits, 2)} SD) — значимо ${r.verdict === 'better' ? 'выше' : 'ниже'}.`)
          : r.verdict === 'unproven'
            ? t(`• ${r.name}: ${sg(r.adj)} балл, бірақ айырма дәлелденбеген (p = ${f(r.p, 2)}).`, `• ${r.name}: ${sg(r.adj)} балла, но разница не доказана (p = ${f(r.p, 2)}).`)
            : t(`• ${r.name}: дерек жеткіліксіз (${r.units} сынып).`, `• ${r.name}: мало данных (${r.units} классов).`),
      ),
    ];
    const fl = rows.find((r) => r.flipped);
    if (fl) lines.push(t(`Назар аударыңыз: орташа балл бойынша ${fl.name} ${sg(fl.naive)} балл болып көрінеді — бұл мектептер айырмасы, оқулықтікі емес.`, `Внимание: по средним баллам ${fl.name} выглядит как ${sg(fl.naive)} балла — это разница школ, а не учебника.`));
    return { text: lines, actions: [{ label: t('Оқулықтарды салыстыру', 'Сравнение учебников'), tab: 'textbooks' }] };
  }

  // 5. Мектептер мен сыныптар
  if (has(q, /мектеп|школ|сынып|класс/) && has(q, /әлсіз|нашар|төмен|слаб|худш|хуже|рейтинг|ең |самы|лучш|жақсы|мықты/)) {
    const byClass = has(q, /сынып|класс/);
    const ranked = rankUnits(c.region, byClass ? 'class' : 'school');
    if (!ranked.length) return { text: [t('Рейтинг жасауға дерек жеткіліксіз.', 'Недостаточно данных для рейтинга.')], actions: [] };
    const best = has(q, /лучш|жақсы|мықты|үздік/);
    const list = best ? [...ranked].reverse().slice(0, 3) : ranked.slice(0, 3);
    const label = (r: Ranked) => (r.unit ? `${r.school}, ${r.unit}` : r.school);
    return {
      text: [
        best
          ? t(`Меңгеру үлесі ең жоғары ${byClass ? 'сыныптар' : 'мектептер'} (барлық тақырып бойынша):`, `${byClass ? 'Классы' : 'Школы'} с самой высокой долей усвоивших (по всем темам):`)
          : t(`Меңгеру үлесі ең төмен ${byClass ? 'сыныптар' : 'мектептер'} (барлық тақырып бойынша):`, `${byClass ? 'Классы' : 'Школы'} с самой низкой долей усвоивших (по всем темам):`),
        ...list.map((r, k) => `${k + 1}. ${label(r)} — ${f(r.mastery)}% (${r.n} ${t('оқушы', 'уч.')})`),
        t(`Облыс орташасы — ${f(mean(c.regionStats.filter((s) => s.status !== 'nodata').map((s) => s.mastery)))}%. Бұл рейтинг мектептің бастапқы деңгейін ескермейді: мұғалімді бағалау үшін емес, көмекті қайда бағыттау керегін көру үшін.`, `Среднее по области — ${f(mean(c.regionStats.filter((s) => s.status !== 'nodata').map((s) => s.mastery)))}%. Рейтинг не учитывает входной уровень: он показывает, куда направить помощь, а не оценивает учителей.`),
      ],
      actions: list.map((r) => ({ label: label(r), tab: 'overview' as AssistTab, scope: { school: r.school, unit: r.unit } })),
    };
  }

  // 6. Қиын тақырыптар
  if (has(q, /қиын|әлсіз|нашар|сложн|слаб|проблем|меңгер|усво|тақырып|тем|қорытынд|вывод|негізгі|главн/)) {
    const hard = usable.filter((s) => s.status === 'hard').sort((a, b) => a.mastery - b.mastery);
    const watch = usable.filter((s) => s.status === 'watch').sort((a, b) => a.mastery - b.mastery);
    const list = (hard.length ? hard : watch).slice(0, 4);
    return {
      text: [
        hard.length
          ? t(`${where}: ${hard.length} тақырып қиын (меңгеру үлесі 50%-дан төмен), тағы ${watch.length} тақырып назарда.`, `${where}: сложных тем — ${hard.length} (доля усвоивших ниже 50%), ещё ${watch.length} в зоне риска.`)
          : t(`${where}: қиын тақырып жоқ, ${watch.length} тақырып назарда.`, `${where}: сложных тем нет, ${watch.length} в зоне риска.`),
        ...list.map((s) => `• «${name(s.i)}» — ${f(s.mastery)}% (${f(s.lo)}–${f(s.hi)})${s.prereq?.root ? t(`; себебі тірек тақырыпта болуы мүмкін: «${name(s.prereq.i)}»`, `; возможная причина в опорной теме «${name(s.prereq.i)}»`) : ''}`),
      ],
      actions: [{ label: t('Тақырыптарды ашу', 'Открыть темы'), tab: 'topics', topic: list[0]?.i }],
    };
  }

  // 7. Анықтама
  return {
    text: [
      t(
        'Мен сайтта есептелген деректер бойынша жауап беремін: қиын тақырыптар және олардың себебі, оқулықтар салыстыруы, сағатты бөлу, ең әлсіз мектептер мен сыныптар, терминдер (сенім аралығы, p-мән, SD). Тақырыптың атын жазсаңыз, ол бойынша толық мәлімет беремін.',
        'Я отвечаю по данным, рассчитанным на сайте: сложные темы и их причины, сравнение учебников, распределение часов, самые слабые школы и классы, термины (доверительный интервал, p-значение, SD). Напишите название темы — расскажу о ней подробно.',
      ),
    ],
    actions: [],
  };
}

export const SUGGESTIONS = {
  kk: ['Ең қиын тақырыптар қандай?', 'Қай оқулық тиімдірек?', 'Сағатты қалай бөлген жөн?', 'Ең әлсіз мектептер', 'Ом заңы неге қиын?', 'Сенім аралығы деген не?'],
  ru: ['Какие темы самые сложные?', 'Какой учебник эффективнее?', 'Как распределить часы?', 'Самые слабые школы', 'Почему трудна тема про закон Ома?', 'Что такое доверительный интервал?'],
};

/** Claude режиміне берілетін ықшам дерек контексті */
export function contextForModel(c: AssistContext): string {
  const { ds, stats, model, lang } = c;
  const L = (x: { kk: string; ru: string }) => x[lang];
  const eff = predictEffect(model, c.recommended);
  return JSON.stringify({
    subject: L(ds.subject),
    grade: ds.grade,
    scope: c.scopeLabel ?? 'region',
    synthetic: ds.synthetic,
    students: ds.students.length,
    topics: ds.topics.map((t, i) => ({
      topic: L(t.name),
      section: L(t.section),
      mastery_pct: Number(stats[i].mastery.toFixed(1)),
      ci95: Number.isNaN(stats[i].lo) ? null : [Number(stats[i].lo.toFixed(1)), Number(stats[i].hi.toFixed(1))],
      students: stats[i].n,
      status: stats[i].status,
      region_mastery_pct: c.scopeLabel ? Number(c.regionStats[i].mastery.toFixed(1)) : undefined,
      prerequisite: stats[i].prereq ? { topic: L(ds.topics[stats[i].prereq!.i].name), mastery_pct: Number(stats[i].prereq!.mastery.toFixed(1)), r: Number(stats[i].prereq!.r.toFixed(2)), likely_root_cause: stats[i].prereq!.root } : null,
      hours_planned: t.planned,
      hours_recommended: c.recommended[i],
      expected_score_change: Number(eff.per[i].delta.toFixed(2)),
      plus_one_hour_effect: Number(model.topics[i].perHour.toFixed(2)),
      hours_evidence: model.topics[i].evidence,
    })),
    textbooks_region: c.textbooks?.rows.map((r) => ({ textbook: r.name, students: r.n, classes: r.units, mean: Number(r.rawMean.toFixed(1)), naive_diff: r.naive, adjusted_effect: r.adj, ci95: r.lo === null ? null : [r.lo, r.hi], p: r.p, sd_units: r.sdUnits, verdict: r.verdict })),
    textbook_reference: c.textbooks?.ref,
    hours_total: model.total,
    expected_avg_change: Number(eff.avg.toFixed(2)),
    weakest_schools: rankUnits(c.region, 'school').slice(0, 5).map((r) => ({ school: r.school, mastery_pct: Number(r.mastery.toFixed(1)), students: r.n })),
  });
}
