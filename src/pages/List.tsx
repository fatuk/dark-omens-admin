import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useContentList, useMeta, useDeleteContent, useSetReady, type ListFilters } from '@/hooks';
import { getContent, createContent } from '@/lib/api';
import { CONTENT_TYPES, ENCOUNTER_KINDS, kindsFor, type ContentRecord } from '@/lib/types';
import { fuzzyFilter } from '@/lib/fuzzy';
import { SortableTh, sortRows, useTableSort } from '@/components/sortable-th';

function fmtWhen(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Фильтры и порядок сортировки переживают перезагрузку/навигацию (localStorage,
// как API base/key). Поиск НЕ сохраняем намеренно: фильтр — это настройка рабочего
// места, а запрос — разовое действие, и «список почему-то пустой» после F5 пугает.
const LS_FILTERS = 'doa_content_filters';
const LS_SORT = 'doa_content_sort';
const LS_NOT_READY = 'doa_content_notready';

function loadFilters(): ListFilters {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_FILTERS);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as ListFilters) : {};
  } catch {
    return {};
  }
}

function loadNotReady(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LS_NOT_READY) === '1';
  } catch {
    return false;
  }
}

export function ListPage() {
  const [filters, setFilters] = useState<ListFilters>(loadFilters);
  const set = (patch: Partial<ListFilters>) => setFilters((f) => ({ ...f, ...patch }));

  useEffect(() => {
    try {
      localStorage.setItem(LS_FILTERS, JSON.stringify(filters));
    } catch { /* localStorage недоступен — не критично */ }
  }, [filters]);

  const { data: meta } = useMeta();
  const { data, isFetching, error, refetch } = useContentList(filters);
  const items = data?.items ?? [];

  const nav = useNavigate();
  const del = useDeleteContent();
  const setReady = useSetReady();

  // Поиск — клиентский и по нескольким полям сразу: у каталогов названия в
  // списке нет (в i18n.en.name его не бывает), видно id, и искать надо по нему.
  const [query, setQuery] = useState('');
  // Фильтр «не готовые» — клиентский: isReady лежит в data карточки, серверных
  // фильтров по полям data нет, а весь список и так приезжает целиком. Живёт в
  // localStorage отдельно от серверных фильтров (в запрос не уходит), как сортировка.
  const [notReady, setNotReady] = useState(loadNotReady);
  useEffect(() => {
    try {
      localStorage.setItem(LS_NOT_READY, notReady ? '1' : '0');
    } catch { /* localStorage недоступен — не критично */ }
  }, [notReady]);
  const { sort, toggle } = useTableSort(LS_SORT);

  const shown = useMemo(() => {
    // Карточку, которую ещё не отмечали, считаем неготовой (бэк отдаёт false).
    const base = notReady ? items.filter((it) => !it.isReady) : items;
    const found = fuzzyFilter(base, query, (it) => [it.title, it.id, it.type, ...it.tags]);
    // Сортировка ПОСЛЕ поиска: пока запрос пуст, порядок серверный (свежие
    // сверху); есть запрос и нет сортировки — порядок по релевантности.
    return sortRows(found, sort, (it, key) => {
      if (key === 'title') return it.title || it.id;
      if (key === 'tags') return it.tags.join(' ');
      // Сортировка по готовности: сначала неготовые — именно их и ищут.
      if (key === 'isReady') return it.isReady ? 1 : 0;
      return (it as unknown as Record<string, unknown>)[key];
    });
  }, [items, query, sort, notReady]);

  // Удаление с подтверждением (необратимо). Список обновляется инвалидацией в хуке.
  function deleteItem(id: string, title: string): void {
    if (!window.confirm(`Удалить «${title || id}»? Действие необратимо.`)) return;
    del.mutate(id);
  }

  // Копия: тянем полную запись, дублируем как ЧЕРНОВИК с пометкой «(копия)» в имени, и
  // сразу открываем на правку — так проще лепить похожие карты.
  async function copyItem(id: string): Promise<void> {
    try {
      const rec = await getContent(id);
      const dup = (loc: 'en' | 'ru', suffix: string): Record<string, unknown> | undefined => {
        const src = rec.i18n[loc];
        if (!src) return undefined;
        const nm = src['name'];
        return { ...src, ...(nm ? { name: `${String(nm)}${suffix}` } : {}) };
      };
      const i18n: ContentRecord['i18n'] = {};
      const ru = dup('ru', ' (копия)'); if (ru) i18n.ru = ru;
      const en = dup('en', ' (copy)'); if (en) i18n.en = en;
      const created = await createContent({
        type: rec.type, kind: rec.kind, status: 'draft',
        tags: rec.tags, data: rec.data, i18n,
      });
      nav(`/edit/${encodeURIComponent(created.id)}`);
    } catch (e) {
      window.alert(`Не удалось скопировать: ${(e as Error).message}`);
    }
  }

  const type = filters.type ?? '';
  const kind = filters.kind ?? '';

  return (
    <div className="mx-auto max-w-[980px]">
      <h2>
        Контент{' '}
        {isFetching
          ? '…'
          : shown.length === items.length
            ? `(${items.length})`
            : `(${shown.length} из ${items.length})`}
      </h2>
      <div className="row">
        <div>
          <label>Тип</label>
          <select
            value={type}
            onChange={(e) => {
              const nt = e.target.value;
              const ks = nt ? kindsFor(nt) : ENCOUNTER_KINDS;
              set({ type: nt, kind: kind && !ks.includes(kind) ? '' : kind });
            }}
          >
            <option value="">— любой —</option>
            {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label>Вид</label>
          <select value={kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">— любой —</option>
            {(type ? kindsFor(type) : ENCOUNTER_KINDS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Статус</label>
          <select value={filters.status ?? ''} onChange={(e) => set({ status: e.target.value })}>
            <option value="">— любой —</option>
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </div>
        <div>
          <label>Древний</label>
          <select value={filters.ancient ?? ''} onChange={(e) => set({ ancient: e.target.value })}>
            <option value="">— любой —</option>
            <option value="any">any (общие)</option>
            {meta?.ancients.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label>Тип локации</label>
          <select value={filters.loc ?? ''} onChange={(e) => set({ loc: e.target.value })}>
            <option value="">— любой —</option>
            {meta?.locationTypes.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label>Иной мир</label>
          <select value={filters.world ?? ''} onChange={(e) => set({ world: e.target.value })}>
            <option value="">— любой —</option>
            {meta?.otherWorlds.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          {/* Пустой сезон — не «любой», а именно неразмеченные: их надо видеть,
              иначе контент молча не доедет до игроков. */}
          <label>Сезон</label>
          <select value={filters.season ?? ''} onChange={(e) => set({ season: e.target.value })}>
            <option value="">— любой —</option>
            {meta?.seasons?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label>Тег</label>
          <input
            value={filters.tag ?? ''}
            onChange={(e) => set({ tag: e.target.value })}
            placeholder="warehouse"
          />
        </div>
        <div className="flex-none">
          <label>Арт</label>
          <button
            className={notReady ? 'primary' : ''}
            onClick={() => setNotReady((v) => !v)}
            title="Показать только карточки, ещё не отмеченные готовыми"
          >
            не готовые
          </button>
        </div>
        <div className="grow">
          <label>Поиск</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="название, id или тег — обрывками: «некр», «vermis», можно не в той раскладке"
          />
        </div>
        <div className="flex-none">
          <label>&nbsp;</label>
          <button onClick={() => void refetch()}>Обновить</button>
        </div>
      </div>

      {error && (
        <div className="msg err">
          Ошибка: {(error as Error).message}. Проверь API base / admin-key в шапке.
        </div>
      )}

      <table className="mt-4">
        <thead>
          <tr>
            <SortableTh label="Название" sortKey="title" sort={sort} onSort={toggle} />
            <SortableTh label="Тип" sortKey="type" sort={sort} onSort={toggle} />
            <SortableTh label="Вид" sortKey="kind" sort={sort} onSort={toggle} />
            <SortableTh label="Статус" sortKey="status" sort={sort} onSort={toggle} />
            <SortableTh
              label="Готово" sortKey="isReady" sort={sort} onSort={toggle}
              title="Карточка полностью готова после редактуры — ручная отметка (data.isReady)"
            />
            <SortableTh label="Теги" sortKey="tags" sort={sort} onSort={toggle} />
            <SortableTh label="Обновлено" sortKey="updatedAt" sort={sort} onSort={toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((it) => (
            <tr key={it.id}>
              <td>
                <Link to={`/edit/${encodeURIComponent(it.id)}`}>
                  {it.title || <span className="hint">{it.id}</span>}
                </Link>
              </td>
              <td>{it.type}</td>
              <td>{it.kind || '—'}</td>
              <td><span className={`badge ${it.status}`}>{it.status}</span></td>
              <td>
                <input
                  type="checkbox"
                  checked={it.isReady}
                  disabled={setReady.isPending}
                  title="Карточка готова после редактуры"
                  onChange={(e) => setReady.mutate({ id: it.id, value: e.target.checked })}
                />
              </td>
              <td>{it.tags.map((t) => <span key={t} className="tag">{t}</span>)}</td>
              <td className="hint whitespace-nowrap">{fmtWhen(it.updatedAt)}</td>
              <td>
                <button onClick={() => void copyItem(it.id)} style={{ marginRight: 12 }}>
                  Копия
                </button>
                <button
                  onClick={() => deleteItem(it.id, it.title ?? '')}
                  disabled={del.isPending}
                  style={{ color: '#e06c6c' }}
                >
                  Удалить
                </button>
              </td>
            </tr>
          ))}
          {shown.length === 0 && !isFetching && (
            <tr>
              <td colSpan={8} className="hint">
                {items.length === 0
                  ? 'Пусто. Создай новую запись.'
                  : query.trim()
                    ? `Ничего не нашлось по запросу «${query}».`
                    : 'Под фильтры ничего не подходит.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
