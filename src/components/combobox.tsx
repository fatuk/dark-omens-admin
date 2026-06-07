// Удобный селект с поиском: фильтр по подстроке, навигация стрелками, Enter/Esc,
// клик-вне закрывает. Список значений строго из options. Выпадашка рендерится в
// портал (position:fixed по rect инпута) — не обрезается узлами/overflow и не
// масштабируется зумом канваса.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function Combobox({ value, options, onChange, placeholder, className }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [query, options]);

  function openMenu(): void {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setQuery('');
    setHi(0);
    setOpen(true);
  }
  function close(): void { setOpen(false); setQuery(''); }
  function pick(v: string): void { onChange(v); close(); }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    // По скролу/ресайзу НЕ закрываем — переставляем меню под инпут.
    const reposition = (): void => {
      if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  return (
    <div ref={boxRef} className={`cbx ${className ?? ''}`}>
      <input
        ref={inputRef}
        className="cbx-input nodrag nopan"
        value={open ? query : value}
        placeholder={placeholder ?? value}
        spellCheck={false}
        onFocus={openMenu}
        onMouseDown={() => { if (!open) openMenu(); }}
        onChange={(e) => { setQuery(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const o = filtered[hi];
            if (o) pick(o);
          } else if (e.key === 'Escape') {
            close();
            inputRef.current?.blur();
          }
        }}
      />
      {open && rect && createPortal(
        <div
          ref={menuRef}
          className="cbx-menu"
          style={{ top: rect.bottom + 2, left: rect.left, minWidth: Math.max(rect.width, 170) }}
        >
          {filtered.length === 0
            ? <div className="cbx-empty">нет совпадений</div>
            : filtered.map((o, i) => (
              <div
                key={o}
                className={`cbx-opt${i === hi ? ' hi' : ''}${o === value ? ' sel' : ''}`}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              >
                {o}
              </div>
            ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
