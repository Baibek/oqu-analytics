import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, TFn } from './common';

export interface SearchItem {
  id: string;
  label: string;
  hint: string;
  icon: string;
  run: () => void;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Тақырыпты, мектепті, сыныпты немесе бетті іздеу (combobox үлгісі, пернетақтамен басқарылады) */
export function Search({ items, t, open, onDone }: { items: SearchItem[]; t: TFn; open: boolean; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [show, setShow] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const found = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return [];
    const words = n.split(/\s+/);
    return items.filter((it) => words.every((w) => norm(`${it.label} ${it.hint}`).includes(w))).slice(0, 9);
  }, [q, items]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // «/» пернесі іздеуге фокус береді
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (it: SearchItem) => {
    it.run();
    setQ('');
    setShow(false);
    input.current?.blur();
    onDone();
  };

  return (
    <div className={`search ${open ? 'open' : ''}`}>
      <Icon name="search" size={16} />
      <span className="sr-only" id="search-help">
        {t('Тақырыпты, мектепті, сыныпты немесе бетті іздеу', 'Поиск темы, школы, класса или страницы')}
      </span>
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={show && q.trim().length > 0}
        aria-controls="search-list"
        aria-autocomplete="list"
        aria-activedescendant={show && found[active] ? `sr-${found[active].id}` : undefined}
        aria-label={t('Іздеу', 'Поиск')}
        aria-describedby="search-help"
        placeholder={t('Тақырып, мектеп немесе сынып іздеу…', 'Поиск темы, школы или класса…')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setShow(true);
        }}
        onFocus={() => setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, found.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && found[active]) {
            e.preventDefault();
            pick(found[active]);
          } else if (e.key === 'Escape') {
            setQ('');
            setShow(false);
            onDone();
          }
        }}
      />
      {!q && <kbd aria-hidden="true">/</kbd>}
      {show && q.trim() && (
        <ul className="search-list" id="search-list" role="listbox">
          {found.length === 0 && <li className="empty">{t('Ештеңе табылмады', 'Ничего не найдено')}</li>}
          {found.map((it, i) => (
            <li
              key={it.id}
              id={`sr-${it.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
            >
              <Icon name={it.icon} size={16} />
              <span>{it.label}</span>
              <small>{it.hint}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
