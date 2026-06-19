import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useContentList, useMeta, useDeleteContent, type ListFilters } from '@/hooks';
import { getContent, createContent } from '@/lib/api';
import { CONTENT_TYPES, ENCOUNTER_KINDS, kindsFor, type ContentRecord } from '@/lib/types';

// Фильтры списка переживают перезагрузку/навигацию (localStorage, как API base/key).
const LS_FILTERS = 'doa_content_filters';

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
      <h2>Контент {isFetching ? '…' : `(${items.length})`}</h2>
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
          <label>Акт</label>
          <select value={filters.act ?? ''} onChange={(e) => set({ act: e.target.value })}>
            <option value="">— любой —</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
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
            <th>Название</th>
            <th>Тип</th>
            <th>Вид</th>
            <th>Статус</th>
            <th>Теги</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>
                <Link to={`/edit/${encodeURIComponent(it.id)}`}>
                  {it.title || <span className="hint">{it.id}</span>}
                </Link>
              </td>
              <td>{it.type}</td>
              <td>{it.kind || '—'}</td>
              <td><span className={`badge ${it.status}`}>{it.status}</span></td>
              <td>{it.tags.map((t) => <span key={t} className="tag">{t}</span>)}</td>
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
          {items.length === 0 && !isFetching && (
            <tr><td colSpan={6} className="hint">Пусто. Создай новую запись.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
