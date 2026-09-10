// Сортировка таблиц по колонкам: состояние + кликабельный заголовок.
//
// Три состояния по клику: по возрастанию → по убыванию → БЕЗ сортировки. Третий
// клик возвращает исходный порядок, который приходит с сервера (`updated_at
// DESC`, свежие сверху) — он осмысленный, и уметь к нему вернуться нужно.
//
// Сортировка чисто клиентская, поверх уже загруженного списка: корпус целиком
// приезжает одним запросом (листинг без пагинации), так что ходить на сервер
// незачем.
import { useEffect, useState } from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string; dir: SortDir }

/** Разбор сохранённого значения. Мусор в localStorage не должен ронять страницу. */
function readSort(storageKey: string | undefined): SortState | null {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const { key, dir } = v as Partial<SortState>;
    if (typeof key !== 'string' || !key) return null;
    return { key, dir: dir === 'desc' ? 'desc' : 'asc' };
  } catch {
    return null;
  }
}

/**
 * Состояние сортировки. `storageKey` — переживать перезагрузку через
 * localStorage, как фильтры списка: раз уж выбранный тип и сезон сохраняются,
 * порядок колонок сбрасывать при F5 непоследовательно.
 *
 * `null` (сортировку сняли) тоже сохраняется — иначе третий клик забывался бы
 * при перезагрузке и список возвращался к последней сортировке.
 */
export function useTableSort(storageKey?: string, initial: SortState | null = null) {
  const [sort, setSort] = useState<SortState | null>(() => readSort(storageKey) ?? initial);

  useEffect(() => {
    if (!storageKey) return;
    try {
      if (sort) localStorage.setItem(storageKey, JSON.stringify(sort));
      else localStorage.removeItem(storageKey);
    } catch { /* localStorage недоступен — не критично, как и у фильтров */ }
  }, [storageKey, sort]);

  const toggle = (key: string): void =>
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      return s.dir === 'asc' ? { key, dir: 'desc' } : null;
    });
  return { sort, toggle };
}

/**
 * Сравнение значений ячеек. Числа — численно; строки — через localeCompare с
 * `numeric`, иначе кириллица уедет в конец по кодам символов, а «id 10» встанет
 * перед «id 2». Пустые значения всегда внизу, независимо от направления: строка
 * без названия — это отсутствие данных, а не «самое маленькое» название.
 */
function cmp(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ru', { numeric: true, sensitivity: 'base' });
}

/** Отсортировать строки; `sort === null` — вернуть как есть. */
export function sortRows<T>(
  rows: readonly T[],
  sort: SortState | null,
  valueOf: (row: T, key: string) => unknown,
): T[] {
  if (!sort) return [...rows];
  // Пустые всегда внизу — поэтому направление разворачиваем ВНУТРИ cmp, а не
  // снаружи: иначе при 'desc' они всплыли бы наверх.
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = valueOf(a, sort.key);
    const bv = valueOf(b, sort.key);
    const aEmpty = av === null || av === undefined || av === '';
    const bEmpty = bv === null || bv === undefined || bv === '';
    if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;
    return cmp(av, bv) * dir;
  });
}

export function SortableTh(
  { label, sortKey, sort, onSort, title }:
  { label: string; sortKey: string; sort: SortState | null; onSort: (key: string) => void; title?: string },
): JSX.Element {
  const active = sort?.key === sortKey;
  const arrow = active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <th>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title ?? 'Сортировать; третий клик — снять сортировку'}
        className={`bg-transparent border-0 p-0 font-semibold text-xs cursor-pointer
                    ${active ? 'text-gold' : 'text-muted hover:text-text'}`}
      >
        {label} <span className={active ? '' : 'opacity-40'}>{arrow}</span>
      </button>
    </th>
  );
}
