// Массовая аналитика: вкладки «Встречи» и «Мифы» (см. MythosAnalytics).
// Встречи: фильтр по осям (вид / статус / сезон / Древний /
// тип локации / конкретная локация / Иной мир / акт / тег / название) → сводка: сколько проверок и
// каких, распределение модификаторов, какие награды и штрафы и в каких ветках.
// Внизу — таблица встреч под фильтром с грубой «щедростью/жёсткостью» для ручного
// разбора. Считается на клиенте из полных записей (/admin/content/bulk).

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { listContentBulk } from '@/lib/api';
import { useMeta } from '@/hooks';
import { fuzzyFilter } from '@/lib/fuzzy';
import { splitTags } from '@/lib/match';
import {
  computeStats, SKILL_RU, VERB_RU, type EncounterRow, type EffectClass,
} from '@/lib/encounter-stats';
import { SortableTh, sortRows, useTableSort } from '@/components/sortable-th';
import { MythosAnalytics } from '@/components/MythosAnalytics';
import type { ContentRecord } from '@/lib/types';

const LS_KEY = 'doa_analytics_filters';

interface Filters {
  kinds: string[];
  status: string;
  season: string;
  ancient: string;
  loc: string;
  /** Конкретная локация — её собственные карты (тег location:<id>, «Стамбул»). Общие
   *  сюда не подмешиваем: вид встречи (своя клетки / общая) выбирает игрок, это две
   *  разные колоды. NO_LOCATION — только карты без привязки к месту. */
  location: string;
  world: string;
  tag: string;
  q: string;
}

const DEFAULT: Filters = {
  kinds: [], status: '', season: '', ancient: '', loc: '', location: '', world: '', tag: '', q: '',
};

const NO_LOCATION = '__none__';

/** Ячейка «раз · Σ»: число вхождений; сумма amount/count серым, только если больше числа
 *  карт (у состояний/активов/навыков она равна числу и лишь дублирует его). */
function CountCell({ c }: { c: { count: number; amount: number } }) {
  if (!c.count) return null;
  return (
    <>
      {c.count}
      {c.amount > c.count && <span className="hint" style={{ marginLeft: 6 }}>Σ{c.amount}</span>}
    </>
  );
}

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Filters>) } : DEFAULT;
  } catch { return DEFAULT; }
}

const MODS = ['-2', '-1', '0', '+1', '+2'];

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : '—';
}

function verbLabel(v: string): string {
  return VERB_RU[v] ?? v;
}

function ClassBadge({ cls }: { cls: EffectClass }) {
  if (cls === 'reward') return <span className="badge published">награда</span>;
  if (cls === 'penalty') return <span className="badge danger">штраф</span>;
  return <span className="badge">нейтр.</span>;
}

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mythos' ? 'mythos' : 'encounters';
  return (
    <div className="container">
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <button className={tab === 'encounters' ? 'primary' : ''} onClick={() => setParams({})}>Встречи</button>
        <button className={tab === 'mythos' ? 'primary' : ''} onClick={() => setParams({ tab: 'mythos' })}>Мифы</button>
      </div>
      <h2>{tab === 'mythos' ? 'Аналитика Мифов' : 'Аналитика встреч'}</h2>
      {tab === 'mythos' ? <MythosAnalytics /> : <EncounterAnalytics />}
    </div>
  );
}

function EncounterAnalytics() {
  const { data: meta } = useMeta();
  const { data, isLoading, error } = useQuery({
    queryKey: ['content', 'bulk', 'encounter'],
    queryFn: () => listContentBulk({ type: 'encounter' }),
    staleTime: 60_000,
  });
  const [f, setF] = useState<Filters>(loadFilters);
  const [showFailure, setShowFailure] = useState(true);
  const { sort, toggle } = useTableSort('doa_analytics_sort');

  function update(patch: Partial<Filters>) {
    const next = { ...f, ...patch };
    setF(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
  }

  const filtered: ContentRecord[] = useMemo(() => {
    const all = data?.records ?? [];
    const base = all.filter((r) => {
      if (f.kinds.length && !f.kinds.includes(r.kind)) return false;
      if (f.status && r.status !== f.status) return false;
      const m = splitTags(r.tags);
      if (f.season && m.season !== f.season) return false;
      if (f.ancient && m.ancient !== f.ancient) return false;
      if (f.loc && m.loc !== f.loc) return false;
      if (f.location === NO_LOCATION && m.location !== '') return false;
      if (f.location && f.location !== NO_LOCATION && m.location !== f.location) return false;
      if (f.world && m.world !== f.world) return false;
      if (f.tag && !r.tags.some((t) => t.includes(f.tag))) return false;
      return true;
    });
    if (!f.q) return base;
    const ru = (r: ContentRecord) => (r.i18n['ru'] ?? r.i18n['en'] ?? {}) as Record<string, unknown>;
    return fuzzyFilter(base, f.q, (r) => [r.id, String(ru(r)['name'] ?? ''), ...r.tags]);
  }, [data, f]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  // Локации для фильтра: из меты (имя) + те, что встречаются в тегах, но меты не знают.
  const locationOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const l of meta?.locations ?? []) byId.set(l.id, l.name);
    for (const r of data?.records ?? []) {
      const id = splitTags(r.tags).location;
      if (id && !byId.has(id)) byId.set(id, `${id} (?)`);
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [meta, data]);

  const rows = useMemo(() => sortRows(stats.rows, sort, (r, key) => {
    if (key === 'checks') return r.checks.map((c) => `${c.skill}${c.modifier}`).join(' ');
    return (r as unknown as Record<string, unknown>)[key];
  }), [stats.rows, sort]);

  if (isLoading) return <div>Загрузка встреч…</div>;
  if (error) return <div className="danger">{String((error as Error).message)}</div>;

  const kinds = meta?.encounterKinds ?? ['general', 'research', 'gate', 'mystery'];
  const totalVerbs = stats.verbs.reduce((s, v) => s + v.success.count + v.failure.count, 0);

  return (
    <>
      <div className="hint">
        Проверки и эффекты веток по всем встречам под фильтром. У gate/mystery считаются все три
        слота (стадия 1, ветка успеха, ветка провала). «Награда» — в ветке успеха, «штраф» — в любой.
      </div>

      <div className="section">
        <div className="section-title">Фильтр</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {kinds.map((k) => {
            const on = f.kinds.includes(k);
            return (
              <button key={k} className={on ? 'primary' : ''}
                onClick={() => update({ kinds: on ? f.kinds.filter((x) => x !== k) : [...f.kinds, k] })}>
                {k}
              </button>
            );
          })}
          <select value={f.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">— статус —</option>
            <option value="published">published</option>
            <option value="draft">draft</option>
          </select>
          <select value={f.season} onChange={(e) => update({ season: e.target.value })}>
            <option value="">— сезон —</option>
            {(meta?.seasons ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={f.ancient} onChange={(e) => update({ ancient: e.target.value })}>
            <option value="">— Древний —</option>
            <option value="any">any (общие)</option>
            {(meta?.ancients ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={f.loc} onChange={(e) => update({ loc: e.target.value })}>
            <option value="">— тип локации —</option>
            {(meta?.locationTypes ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={f.location} onChange={(e) => update({ location: e.target.value })}>
            <option value="">— локация —</option>
            <option value={NO_LOCATION}>без привязки (общие)</option>
            {locationOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={f.world} onChange={(e) => update({ world: e.target.value })}>
            <option value="">— Иной мир —</option>
            {(meta?.otherWorlds ?? []).map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <input value={f.tag} onChange={(e) => update({ tag: e.target.value })} placeholder="тег содержит…" style={{ width: 160 }} />
          <input value={f.q} onChange={(e) => update({ q: e.target.value })} placeholder="название / id" style={{ width: 200 }} />
          <button onClick={() => update(DEFAULT)}>Сбросить</button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Сводка</div>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div><b>{stats.encounters}</b> встреч ({Object.entries(stats.byKind).map(([k, n]) => `${k}: ${n}`).join(', ') || '—'})</div>
          <div><b>{stats.checks}</b> проверок</div>
          <div><b>{stats.withoutCheck}</b> без проверки</div>
          <div><b>{totalVerbs}</b> эффектов</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Проверки по навыкам</div>
        <table>
          <thead>
            <tr>
              <th>Навык</th><th>Проверок</th><th>Доля</th>
              {MODS.map((m) => <th key={m} title="модификатор">{m}</th>)}
              <th>Средний мод.</th>
            </tr>
          </thead>
          <tbody>
            {stats.skills.map((s) => (
              <tr key={s.skill}>
                <td>{SKILL_RU[s.skill] ?? s.skill}</td>
                <td>{s.count}</td>
                <td>{pct(s.count, stats.checks)}</td>
                {MODS.map((m) => <td key={m}>{s.byModifier[m] ?? ''}</td>)}
                <td>{s.avgModifier.toFixed(2)}</td>
              </tr>
            ))}
            {stats.skills.length === 0 && <tr><td colSpan={9}>Проверок нет.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section">
        <div className="section-title">Награды и штрафы</div>
        <div className="hint">
          Число — сколько раз эффект встречается в ветках; серым рядом — суммарный amount/count,
          если он больше числа карт (здоровье, рассудок, ресурсы). Детали — состояния/трейты/навыки.
        </div>
        <label className="row" style={{ gap: 6, margin: '6px 0' }}>
          <input type="checkbox" checked={showFailure} onChange={(e) => setShowFailure(e.target.checked)} />
          показывать колонки ветки провала
        </label>
        <table>
          <thead>
            <tr>
              <th>Эффект</th><th>Класс</th>
              <th>Успех</th>
              {showFailure && <th>Провал</th>}
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>
            {stats.verbs.map((v) => (
              <tr key={v.verb}>
                <td title={v.verb}>{verbLabel(v.verb)}</td>
                <td><ClassBadge cls={v.cls} /></td>
                <td><CountCell c={v.success} /></td>
                {showFailure && <td><CountCell c={v.failure} /></td>}
                <td className="hint">
                  {Object.entries(v.details).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ×${n}`).join(', ')}
                </td>
              </tr>
            ))}
            {stats.verbs.length === 0 && <tr><td colSpan={5}>Эффектов нет.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section">
        <div className="section-title">Встречи под фильтром ({rows.length})</div>
        <table>
          <thead>
            <tr>
              <SortableTh label="Название" sortKey="title" sort={sort} onSort={toggle} />
              <SortableTh label="Вид" sortKey="kind" sort={sort} onSort={toggle} />
              <SortableTh label="Проверки" sortKey="checks" sort={sort} onSort={toggle} />
              <SortableTh label="Награда" sortKey="rewardScore" sort={sort} onSort={toggle} title="сумма amount наград в ветках успеха" />
              <SortableTh label="Штраф" sortKey="penaltyScore" sort={sort} onSort={toggle} title="сумма amount штрафов во всех ветках" />
              <th>Теги</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: EncounterRow) => (
              <tr key={r.id}>
                <td><Link to={`/edit/${r.id}`}>{r.title}</Link>{r.status === 'draft' && <span className="badge"> draft</span>}</td>
                <td>{r.kind}</td>
                <td>
                  {r.checks.length === 0 ? <span className="hint">—</span> : r.checks.map((c, i) => (
                    <span key={i} title={c.slot}>
                      {SKILL_RU[c.skill] ?? c.skill}{c.modifier ? (c.modifier > 0 ? ` +${c.modifier}` : ` ${c.modifier}`) : ''}{i < r.checks.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </td>
                <td>{r.rewardScore || ''}</td>
                <td>{r.penaltyScore || ''}</td>
                <td className="hint">{r.tags.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
