import { useEffect, useMemo, useRef, useState } from 'react';
import { answer, AssistAction, AssistContext, contextForModel, suggestions } from '../lib/assistant';
import { Ctx, Icon } from './common';

interface Msg {
  role: 'user' | 'bot';
  text: string;
  actions?: AssistAction[];
  source?: 'local' | 'claude';
  error?: boolean;
}

const KEY_STORE = 'oqu.claudeKey';
const readKey = () => {
  try {
    return sessionStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
};
const writeKey = (v: string) => {
  try {
    if (v) sessionStorage.setItem(KEY_STORE, v);
    else sessionStorage.removeItem(KEY_STORE);
  } catch {
    /* жеке режимде сақталмайды — кілт тек осы бетте қалады */
  }
};

const SYSTEM = `You are the assistant inside Oqu Analytics, a web tool that helps school curriculum methodologists in Kazakhstan choose textbooks and plan teaching hours from students' test results.
Answer using only the DATA JSON that follows; the site computed it for the subject, grade and scope the user is looking at. Reply in the language of the question (Kazakh or Russian).
Quote the numbers you rely on, with their confidence interval, p-value or evidence level where the data gives one. When the data cannot answer the question, say that plainly instead of guessing, and suggest which page of the site to open.
When "synthetic" is true, the data is a demo and invented; mention this if the user asks about real schools or publishers.
Field notes: mastery_pct is the share of students scoring at least 50; status "hard" means below 50%, "watch" below 65%, "nodata" means too few students for a conclusion. sections aggregates topics per section. weakest_schools lists the five schools with the lowest mastery and, for each, the topics furthest below the region; such rankings ignore students' starting level, so never use them to judge teachers.
Hours: plus_one_hour_effect is the expected change in a topic's mean score for one hour above plan; for h hours the model gives hours_gain_log × ln(h / hours_planned). It is valid only inside hours_trusted_range (about ±30% of plan and what classes in the data actually had); outside it, say the data cannot predict. With hours_evidence "none" the benefit of extra hours is not shown. The yearly hours_total stays fixed, so hours added to one topic come from another.
LOCAL_ANSWER, when present, is the site's built-in analyser's reply to this same question, computed from the full data (for example a specific school or class, a section, or a what-if on hours). Use its numbers where they fit the question and do not contradict it when it says data is insufficient; ignore it if it misread the question.
Never state a number that is not in DATA or LOCAL_ANSWER.
Keep answers short: two to five sentences or a short list, in plain text without markdown headings.`;

/** Claude режимі: SDK тек осы режим қосылғанда жүктеледі */
async function askClaude(key: string, history: Msg[], question: string, data: string, onDelta: (d: string) => void): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const past = history
    .filter((m) => !m.error)
    .slice(-8)
    .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }));
  // Тарих ассистент жауабынан басталмауы керек
  while (past.length && past[0].role === 'assistant') past.shift();
  try {
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `DATA:\n${data}` },
      ],
      messages: [...past, { role: 'user', content: question }],
    });
    stream.on('text', onDelta);
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('refusal');
    return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('auth');
    if (e instanceof Anthropic.RateLimitError) throw new Error('rate');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('network');
    throw e;
  }
}

export function Assistant({ c, open, onClose, seed, ax }: { c: Ctx; open: boolean; onClose: () => void; seed: { q: string; n: number } | null; ax: AssistContext }) {
  const { t, lang } = c;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'local' | 'claude'>(() => (readKey() ? 'claude' : 'local'));
  const [key, setKey] = useState(readKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  // Ұсынылатын сұрақтар ағымдағы курс пен таңдауға сай (нақты тақырып атауларымен)
  const sugg = useMemo(() => suggestions(ax), [ax]);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [msgs, open]);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Басқа беттен «ИИ-дан сұрау» арқылы келген сұрақ
  useEffect(() => {
    if (seed && open) void send(seed.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.n]);

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setInput('');
    const history = msgs;
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    if (mode === 'local' || !key) {
      const r = answer(q, ax);
      setMsgs((m) => [...m, { role: 'bot', text: r.text.join('\n'), actions: r.actions, source: 'local' }]);
      return;
    }
    setBusy(true);
    setMsgs((m) => [...m, { role: 'bot', text: '', source: 'claude' }]);
    const local = answer(q, ax);
    // Кірістірілген талдаушының есептеген нақты сандары: нақты мектеп, «не болады?» т.б. сұрақтарға
    const data = `${contextForModel(ax)}\n\nLOCAL_ANSWER (intent: ${local.intent}):\n${local.text.join('\n')}`;
    try {
      const full = await askClaude(key, history, q, data, (d) =>
        setMsgs((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], text: copy[copy.length - 1].text + d };
          return copy;
        }),
      );
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'bot', text: full, actions: local.actions, source: 'claude' };
        return copy;
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const why =
        code === 'auth'
          ? t('API кілті қабылданбады. Кілтті тексеріңіз.', 'API-ключ не принят. Проверьте ключ.')
          : code === 'rate'
            ? t('Сұраныс шегінен асты, сәлден кейін қайталаңыз.', 'Превышен лимит запросов, повторите позже.')
            : code === 'network'
              ? t('Claude-қа қосылу мүмкін болмады (интернет?).', 'Не удалось подключиться к Claude (интернет?).')
              : code === 'refusal'
                ? t('Claude бұл сұраққа жауап бермеді.', 'Claude не ответил на этот вопрос.')
                : t('Claude-тан жауап алу кезінде қате шықты.', 'Ошибка при получении ответа от Claude.');
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'bot', text: `${why}\n\n${t('Кірістірілген талдаушының жауабы:', 'Ответ встроенного аналитика:')}\n${local.text.join('\n')}`, actions: local.actions, source: 'local', error: true };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  const run = (a: AssistAction) => {
    if (a.scope) c.setScope(a.scope.school, a.scope.unit);
    if (a.topic !== undefined) c.openTopic(a.topic);
    else if (a.tab) c.go(a.tab);
    if (window.matchMedia('(max-width: 640px)').matches) onClose();
  };

  if (!open) return null;
  return (
    <aside className="ai-drawer" role="dialog" aria-modal="false" aria-labelledby="ai-title">
      <div className="ai-head">
        <span className="av">
          <Icon name="sparkle" size={20} />
        </span>
        <div>
          <h2 id="ai-title">{t('ИИ көмекші', 'ИИ-помощник')}</h2>
          <p>{c.scopeLabel ?? `${c.ds.subject[lang]}${c.ds.grade ? ` · ${t(`${c.ds.grade}-сынып`, `${c.ds.grade} класс`)}` : ''}`}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={t('Жабу', 'Закрыть')}>
          <Icon name="close" />
        </button>
      </div>

      <div className="ai-mode">
        <span>{t('Режим:', 'Режим:')}</span>
        <div className="seg" role="group" aria-label={t('Көмекші режимі', 'Режим помощника')}>
          <button aria-pressed={mode === 'local'} onClick={() => setMode('local')}>
            {t('Кірістірілген талдаушы', 'Встроенный аналитик')}
          </button>
          <button aria-pressed={mode === 'claude'} onClick={() => setMode('claude')}>
            Claude
          </button>
        </div>
      </div>
      {mode === 'claude' && !key && (
        <form
          className="ai-key"
          onSubmit={(e) => {
            e.preventDefault();
            const v = keyDraft.trim();
            if (!v) return;
            writeKey(v);
            setKey(v);
            setKeyDraft('');
          }}
        >
          <label htmlFor="ai-key-in">
            {t(
              'Өз Anthropic API кілтіңізді енгізіңіз. Ол тек осы браузер қойындысында сақталады және тек api.anthropic.com-ға жіберіледі. Кілтсіз кірістірілген талдаушы жұмыс істейді.',
              'Введите свой ключ Anthropic API. Он хранится только в этой вкладке браузера и отправляется только на api.anthropic.com. Без ключа работает встроенный аналитик.',
            )}
          </label>
          <div className="row">
            <input id="ai-key-in" type="password" autoComplete="off" placeholder="sk-ant-…" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
            <button className="btn primary sm" type="submit">
              <Icon name="key" size={15} />
              {t('Сақтау', 'Сохранить')}
            </button>
          </div>
        </form>
      )}
      {mode === 'claude' && key && (
        <div className="ai-key">
          <div className="row" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{t('Claude қосулы (claude-opus-5-5). Жауаптар осы беттегі деректерге сүйенеді.', 'Claude подключён (claude-opus-5-5). Ответы опираются на данные этой страницы.')}</span>
            <button
              className="btn sm"
              onClick={() => {
                writeKey('');
                setKey('');
              }}
            >
              {t('Кілтті өшіру', 'Удалить ключ')}
            </button>
          </div>
        </div>
      )}

      <div className="ai-body" ref={body} aria-live="polite">
        {msgs.length === 0 && (
          <div className="msg bot">
            {t(
              'Сәлеметсіз бе! Мен осы беттегі деректер бойынша жауап беремін: қиын тақырыптар мен бөлімдер және олардың себебі, оқулықтар, сағат жоспары («2 сағат қоссақ не болады?»), нақты мектеп не сынып («№5 мектеп», «8Ә»), «не істеу керек?». Төмендегі сұрақтардың бірін таңдаңыз немесе өзіңіз жазыңыз.',
              'Здравствуйте! Я отвечаю по данным этой страницы: сложные темы и разделы и их причины, учебники, план часов («что будет, если добавить 2 часа?»), конкретная школа или класс («школа №5», «8Б»), «что делать?». Выберите вопрос ниже или напишите свой.',
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? 'err' : ''}`}>
            {m.text || (
              <span className="typing" aria-label={t('Жауап жазылуда', 'Пишет ответ')}>
                <i />
                <i />
                <i />
              </span>
            )}
            {m.role === 'bot' && m.text && <span className="src">{m.source === 'claude' ? 'Claude · claude-opus-5-5' : t('Кірістірілген талдаушы · есептелген деректер', 'Встроенный аналитик · рассчитанные данные')}</span>}
            {!!m.actions?.length && (
              <span className="acts">
                {m.actions.map((a, k) => (
                  <button key={k} className="btn sm" onClick={() => run(a)}>
                    {a.label} <Icon name="arrow" size={14} />
                  </button>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="ai-sugg">
        {sugg.slice(0, msgs.length ? 3 : 6).map((s) => (
          <button key={s} onClick={() => void send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="ai-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="ai-input" className="sr-only">
          {t('Сұрақ', 'Вопрос')}
        </label>
        <textarea
          id="ai-input"
          ref={field}
          rows={1}
          value={input}
          placeholder={t('Сұрағыңызды жазыңыз…', 'Напишите вопрос…')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button className="btn primary" type="submit" disabled={busy || !input.trim()} aria-label={t('Жіберу', 'Отправить')}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={16} />}
        </button>
      </form>
    </aside>
  );
}
