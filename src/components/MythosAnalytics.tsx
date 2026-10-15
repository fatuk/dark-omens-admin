// Аналитика Мифов — вкладка страницы «Аналитика». Два вопроса автора:
//   1. Общий баланс всех карт Мифов (как у встреч): символы колоды, профиль цвета,
//      Рок/врата/урон/награды, проверки и Слухи — по фильтру; отклонения от профиля цвета.
//   2. Колода Древнего: рецепт mythosDeck.byAct против его пула (тот же алгоритм, что
//      relay mythosDeckFromCorpus) — нехватка цвета (повторы/заглушки), шанс карты
//      попасть в партию и ОЖИДАНИЕ по актам (Рок, врата, всплески, урон…) против часов Рока.
// Считается на клиенте из полных записей (/admin/content/bulk), кэш общий с редактором.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { listContentBulk } from '@/lib/api';
import { useMeta } from '@/hooks';
import { fuzzyFilter } from '@/lib/fuzzy';
import { SKILL_RU, VERB_RU, classify } from '@/lib/encounter-stats';
import {
  analyzeDeck, computeMythosStats, COLOR_RU, METRICS, SECTIONS, SUBTYPE_RU, SYMBOLS,
  type DeckAnalysis, type MythosRow, type Recipe,
} from '@/lib/mythos-stats';
import { SortableTh, sortRows, useTableSort } from '@/components/sortable-th';
import type { ContentRecord } from '@/lib/types';

const LS_KEY = 'doa_mythos_analytics_filters';

interface Filters { ancient: string; status: string; season: string; colors: string[]; subtype: string; q: string }
const DEFAULT: Filters = { ancient: '', status: '', season: '', colors: [], subtype: '', q: '' };

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Filters>) } : DEFAULT;
  } catch { return DEFAULT; }
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const fmt = (x: number): string => (Math.round(x * 10) / 10).toString();
const COLOR_DOT: Record<string, string> = { green: '#4f9a5a', yellow: '#c9a227', blue: '#4a7fc1' };

function ColorTag({ color }: { color: string }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{
        display: 'inline-block', width: 9, height: 9, borderRadius: 9, marginRight: 5,
        background: COLOR_DOT[color] ?? '#888',
      }} />
      {COLOR_RU[color] ?? color}
    </span>
  );
}

interface AncientInfo { id: string; name: string; doomClock: number; recipe: Recipe | null }

function ancientsOf(records: ContentRecord[], names: Record<string, string>): AncientInfo[] {
  return records.map((r) => {
    const d = r.data as Record<string, unknown>;
    const md = (d['mythosDeck'] ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      name: names[r.id] ?? r.id,
      doomClock: Number(d['doomClock']) || 0,
      recipe: (md['byAct'] as Recipe | undefined) ?? null,
    };
  });
}

export function MythosAnalytics() {
  const { data: meta } = useMeta();
  const mythosQ = useQuery({
    queryKey: ['content', 'bulk', 'mythos'],
    queryFn: () => listContentBulk({ type: 'mythos' }),
    staleTime: 60_000,
  });
  const ancientQ = useQuery({
    queryKey: ['content', 'bulk', 'ancient'],
    queryFn: () => listContentBulk({ type: 'ancient' }),
    staleTime: 60_000,
  });
  const [f, setF] = useState<Filters>(loadFilters);
  const { sort, toggle } = useTableSort('doa_mythos_analytics_sort');

  function update(patch: Partial<Filters>) {
    const next = { ...f, ...patch };
    setF(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
  }

  const all = mythosQ.data?.records ?? [];
  const names = useMemo(
    () => Object.fromEntries((meta?.ancients ?? []).map((a) => [a.id, a.name])),
    [meta],
  );
  const ancients = useMemo(() => ancientsOf(ancientQ.data?.records ?? [], names), [ancientQ.data, names]);

  const filtered: ContentRecord[] = useMemo(() => {
    const allStats = computeMythosStats(all);
    const byId = new Map(allStats.rows.map((r) => [r.id, r]));
    const base = all.filter((rec) => {
      const r = byId.get(rec.id)!;
      if (f.ancient && r.ancient !== f.ancient) return false;
      if (f.status && rec.status !== f.status) return false;
      if (f.season && r.season !== f.season) return false;
      if (f.colors.length && !f.colors.includes(r.color)) return false;
      if (f.subtype && r.subtype !== f.subtype) return false;
      return true;
    });
    if (!f.q) return base;
    const ru = (r: ContentRecord) => (r.i18n['ru'] ?? r.i18n['en'] ?? {}) as Record<string, unknown>;
    return fuzzyFilter(base, f.q, (r) => [r.id, String(ru(r)['name'] ?? ''), ...r.tags]);
  }, [all, f]);

  const stats = useMemo(() => computeMythosStats(filtered), [filtered]);
  const allRows = useMemo(() => computeMythosStats(all).rows, [all]);

  // Колоды: по выбранному Древнему — подробно; без выбора — сводка по всем.
  const decks = useMemo(() => ancients.map((a) => ({
    a, deck: analyzeDeck(allRows.filter((r) => r.ancient === a.id), a.recipe),
  })), [ancients, allRows]);

  const rows = useMemo(() => sortRows(stats.rows, sort, (r, key) => {
    if (key === 'checks') return r.checks.map((c) => `${c.skill}${c.modifier}`).join(' ');
    if (key.startsWith('sym.')) return r.symbols[key.slice(4) as keyof MythosRow['symbols']];
    return (r as unknown as Record<string, unknown>)[key];
  }), [stats.rows, sort]);

  if (mythosQ.isLoading || ancientQ.isLoading) return <div>Загрузка Мифов…</div>;
  const err = mythosQ.error ?? ancientQ.error;
  if (err) return <div className="danger">{String((err as Error).message)}</div>;

  const selected = decks.find((x) => x.a.id === f.ancient);
  const subtypes = [...new Set(allRows.map((r) => r.subtype))];

  return (
    <>
      <div className="hint">
        Символы колоды (Знамение, Расплата, Врата, Всплеск, Улики на поле) считаются по эффектам
        «При раскрытии». Рок, монстры, урон и награды — по раскрытию, Расплате и «Пока в игре».
        У выбора (choice) учитываются все варианты — это верхняя граница, а не среднее.
      </div>

      <div className="section">
        <div className="section-title">Фильтр</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <select value={f.ancient} onChange={(e) => update({ ancient: e.target.value })}>
            <option value="">— Древний (все) —</option>
            {ancients.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {['green', 'yellow', 'blue'].map((c) => {
            const on = f.colors.includes(c);
            return (
              <button key={c} className={on ? 'primary' : ''}
                onClick={() => update({ colors: on ? f.colors.filter((x) => x !== c) : [...f.colors, c] })}>
                <ColorTag color={c} />
              </button>
            );
          })}
          <select value={f.subtype} onChange={(e) => update({ subtype: e.target.value })}>
            <option value="">— вид —</option>
            {subtypes.map((s) => <option key={s} value={s}>{SUBTYPE_RU[s] ?? s}</option>)}
          </select>
          <select value={f.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">— статус —</option>
            <option value="published">published</option>
            <option value="draft">draft</option>
          </select>
          <select value={f.season} onChange={(e) => update({ season: e.target.value })}>
            <option value="">— сезон —</option>
            {(meta?.seasons ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={f.q} onChange={(e) => update({ q: e.target.value })} placeholder="название / id" style={{ width: 200 }} />
          <button onClick={() => update(DEFAULT)}>Сбросить</button>
        </div>
      </div>

      {selected
        ? <DeckSection name={selected.a.name} doomClock={selected.a.doomClock} deck={selected.deck} />
        : <DecksOverview decks={decks} onPick={(id) => update({ ancient: id })} />}

      <div className="section">
        <div className="section-title">Сводка</div>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div><b>{stats.cards}</b> карт</div>
          {stats.colors.map((p) => <div key={p.color}><ColorTag color={p.color} />: <b>{p.count}</b></div>)}
          <div>
            {Object.entries(stats.colors.reduce<Record<string, number>>((acc, p) => {
              for (const [k, n] of Object.entries(p.subtypes)) acc[k] = (acc[k] ?? 0) + n;
              return acc;
            }, {})).map(([k, n]) => `${SUBTYPE_RU[k] ?? k}: ${n}`).join(', ')}
          </div>
          <div><b>{stats.checks}</b> проверок</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Профиль цвета</div>
        <div className="hint">
          Доля карт цвета с символом и среднее на карту. Цвет — это «характер» карты: если у цвета
          символ почти всегда есть, карта без него выбивается (см. отклонения ниже).
        </div>
        <table>
          <thead>
            <tr>
              <th>Цвет</th><th>Карт</th>
              {SYMBOLS.map((s) => <th key={s.key} title="доля карт с символом">{s.label}</th>)}
              {METRICS.filter((m) => !SYMBOLS.some((s) => s.key === m.key)).map((m) => (
                <th key={m.key} title="среднее на карту">{m.label} ⌀</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.colors.map((p) => (
              <tr key={p.color}>
                <td><ColorTag color={p.color} /></td>
                <td>{p.count}</td>
                {SYMBOLS.map((s) => <td key={s.key}>{p.share[s.key] ? pct(p.share[s.key]) : ''}</td>)}
                {METRICS.filter((m) => !SYMBOLS.some((s) => s.key === m.key)).map((m) => (
                  <td key={m.key}>{p.mean[m.key] ? fmt(p.mean[m.key]) : ''}</td>
                ))}
              </tr>
            ))}
            {stats.colors.length === 0 && <tr><td colSpan={16}>Карт нет.</td></tr>}
          </tbody>
        </table>
      </div>

      {stats.outliers.length > 0 && (
        <div className="section">
          <div className="section-title">Отклонения от профиля цвета ({stats.outliers.length})</div>
          <table>
            <tbody>
              {stats.outliers.map((o, i) => (
                <tr key={`${o.id}-${i}`}>
                  <td><Link to={`/edit/${o.id}`}>{o.title}</Link></td>
                  <td><ColorTag color={o.color} /></td>
                  <td className="hint">{o.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section">
        <div className="section-title">Проверки</div>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          {Object.entries(stats.bySkill).sort((a, b) => b[1].count - a[1].count).map(([sk, v]) => (
            <div key={sk}>{SKILL_RU[sk] ?? sk}: <b>{v.count}</b> <span className="hint">мод. ⌀ {fmt(v.modSum / v.count)}</span></div>
          ))}
          {stats.checks === 0 && <div className="hint">Проверок нет.</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Эффекты по моменту срабатывания</div>
        <table>
          <thead>
            <tr>
              <th>Эффект</th><th>Класс</th>
              {SECTIONS.map((s) => <th key={s.key}>{s.label}</th>)}
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>
            {stats.verbs.map((v) => {
              const cls = classify(v.verb);
              return (
                <tr key={v.verb}>
                  <td title={v.verb}>{VERB_RU[v.verb] ?? v.verb}</td>
                  <td>
                    {cls === 'reward' && <span className="badge published">награда</span>}
                    {cls === 'penalty' && <span className="badge danger">штраф</span>}
                    {cls === 'neutral' && <span className="badge">нейтр.</span>}
                  </td>
                  {SECTIONS.map((s) => {
                    const c = v.bySection[s.key];
                    return (
                      <td key={s.key}>
                        {c.count || ''}
                        {c.amount > c.count && <span className="hint" style={{ marginLeft: 6 }}>Σ{c.amount}</span>}
                      </td>
                    );
                  })}
                  <td className="hint">
                    {Object.entries(v.details).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ×${n}`).join(', ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section">
        <div className="section-title">Карты под фильтром ({rows.length})</div>
        <table>
          <thead>
            <tr>
              <SortableTh label="Название" sortKey="title" sort={sort} onSort={toggle} />
              <SortableTh label="Цвет" sortKey="color" sort={sort} onSort={toggle} />
              <SortableTh label="Вид" sortKey="subtype" sort={sort} onSort={toggle} />
              <SortableTh label="Акт" sortKey="act" sort={sort} onSort={toggle} title="сценарная стадия (data.act)" />
              {SYMBOLS.map((s) => <SortableTh key={s.key} label={s.label} sortKey={`sym.${s.key}`} sort={sort} onSort={toggle} />)}
              <SortableTh label="Рок" sortKey="doom" sort={sort} onSort={toggle} title="advanceDoom при раскрытии и в Расплату" />
              <SortableTh label="Монстры" sortKey="monsters" sort={sort} onSort={toggle} title="spawnMonster / toughenMonster (без всплеска)" />
              <SortableTh label="Урон" sortKey="harm" sort={sort} onSort={toggle} title="штрафы сыщикам; ×каждому — forEach" />
              <SortableTh label="Награды" sortKey="rewards" sort={sort} onSort={toggle} />
              <SortableTh label="Слух" sortKey="rumorTokens" sort={sort} onSort={toggle} title="жетоны таймера (или прогресс решения); исход" />
              <SortableTh label="Проверки" sortKey="checks" sort={sort} onSort={toggle} />
              <th>Древний</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: MythosRow) => (
              <tr key={r.id}>
                <td><Link to={`/edit/${r.id}`}>{r.title}</Link>{r.status === 'draft' && <span className="badge"> draft</span>}</td>
                <td><ColorTag color={r.color} /></td>
                <td>{SUBTYPE_RU[r.subtype] ?? r.subtype}</td>
                <td>{r.act || ''}</td>
                {SYMBOLS.map((s) => <td key={s.key}>{r.symbols[s.key] || ''}</td>)}
                <td>{r.doom || ''}</td>
                <td>{r.monsters || ''}</td>
                <td>{r.harm || ''}{r.harm > 0 && r.perInvestigator && <span className="hint"> ×каждому</span>}</td>
                <td>{r.rewards || ''}</td>
                <td>
                  {r.isRumor && (
                    <span title={`решение: ${r.rumorSolve}; «Рок +1…» — repeat (напр. за каждые врата на поле)`}>
                      {r.rumorTokens > 0 ? `${r.rumorTokens} ⏳` : 'прогресс'}
                      {r.losesGame ? ' → поражение' : r.doomOnExpire ? ` → Рок +${r.doomOnExpire}${r.doomOnExpire === 1 ? '…' : ''}` : ''}
                    </span>
                  )}
                </td>
                <td>
                  {r.checks.map((c, i) => (
                    <span key={i}>
                      {SKILL_RU[c.skill] ?? c.skill}{c.modifier ? (c.modifier > 0 ? ` +${c.modifier}` : ` ${c.modifier}`) : ''}{i < r.checks.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </td>
                <td className="hint">{names[r.ancient] ?? r.ancient}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Колода выбранного Древнего ───────────────────────────────────────────────

function DeckSection({ name, doomClock, deck }: { name: string; doomClock: number; deck: DeckAnalysis }) {
  return (
    <div className="section">
      <div className="section-title">Колода Мифов: {name}</div>
      {deck.mode === 'none' && <div className="hint">Нет ни рецепта (mythosDeck.byAct), ни сценарных карт (data.act) — партия возьмёт шаблонную колоду.</div>}
      {deck.mode === 'scenario' && <div className="hint">Сценарная колода: стадия каждой карты закреплена (data.act), рецепт по цветам не используется.</div>}
      {deck.mode === 'recipe' && (
        <div className="hint">
          По рецепту: на каждый акт берутся случайные опубликованные карты нужного цвета из пула
          Древнего, без повторов, пока пул цвета не исчерпан. Ожидание = число слотов × среднее по цвету.
        </div>
      )}
      {deck.warnings.length > 0 && (
        <ul style={{ margin: '6px 0' }}>
          {deck.warnings.map((w) => <li key={w} className="danger">{w}</li>)}
        </ul>
      )}

      {deck.mode === 'recipe' && (
        <table>
          <thead>
            <tr>
              <th>Цвет</th><th>В пуле</th>
              {[1, 2, 3].map((a) => <th key={a}>Акт {a}</th>)}
              <th>Всего нужно</th><th title="шанс конкретной карты цвета попасть в партию">Шанс карты</th>
            </tr>
          </thead>
          <tbody>
            {['green', 'yellow', 'blue'].filter((c) => (deck.wantByColor[c] ?? 0) > 0 || (deck.pool[c] ?? 0) > 0).map((c) => (
              <tr key={c}>
                <td><ColorTag color={c} /></td>
                <td>{deck.pool[c] ?? 0}</td>
                {[1, 2, 3].map((a) => {
                  const s = deck.slots.find((x) => x.act === a && x.color === c);
                  if (!s) return <td key={a} />;
                  return (
                    <td key={a}>
                      {s.want}
                      {s.repeats > 0 && <span className="danger" title="свои карты, но повтором"> · повтор {s.repeats}</span>}
                      {s.padded > 0 && <span className="danger" title="своих карт нет — шаблон"> · заглушка {s.padded}</span>}
                    </td>
                  );
                })}
                <td>{deck.wantByColor[c] ?? 0}</td>
                <td>{deck.wantByColor[c] ? pct(deck.drawChance[c] ?? 0) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deck.mode !== 'none' && (
        <>
          <div className="section-title" style={{ marginTop: 12 }}>
            {deck.mode === 'recipe' ? 'Ожидание по актам' : 'Состав по актам'}
          </div>
          <table>
            <thead>
              <tr>
                <th>Акт</th><th>Карт</th>
                {METRICS.map((m) => <th key={m.key}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {deck.acts.map((a) => (
                <tr key={a.act}>
                  <td>{a.act}</td>
                  <td>{a.size}</td>
                  {METRICS.map((m) => <td key={m.key}>{a.expected[m.key] ? fmt(a.expected[m.key]) : ''}</td>)}
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td>Всего</td>
                <td>{deck.size}</td>
                {METRICS.map((m) => <td key={m.key}>{deck.cumulative[m.key] ? fmt(deck.cumulative[m.key]) : ''}</td>)}
              </tr>
            </tbody>
          </table>
          <div className="hint" style={{ marginTop: 6 }}>
            Часы Рока: <b>{doomClock || '—'}</b>. Рок прямо с карт за партию ≈ <b>{fmt(deck.cumulative.doom)}</b>;
            врат откроется ≈ <b>{fmt(deck.cumulative.gates)}</b> (каждые врата на поле — Рок в Расплату,
            а совпадение со Знамением — ещё), Знамение сдвинется ≈ <b>{fmt(deck.cumulative.omen)}</b> раз.
          </div>
        </>
      )}

      {deck.mode === 'scenario' && deck.scenario.map((s) => (
        <div key={s.act} style={{ marginTop: 8 }}>
          <b>Акт {s.act}</b>:{' '}
          {s.rows.length === 0 ? <span className="hint">пусто</span> : s.rows.map((r, i) => (
            <span key={r.id}>
              <Link to={`/edit/${r.id}`}>{r.title}</Link> <ColorTag color={r.color} />{i < s.rows.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Сводка колод всех Древних ─────────────────────────────────────────────────

function DecksOverview(
  { decks, onPick }: { decks: { a: AncientInfo; deck: DeckAnalysis }[]; onPick: (id: string) => void },
) {
  return (
    <div className="section">
      <div className="section-title">Колоды Древних</div>
      <div className="hint">Выбери Древнего в фильтре (или кликни по имени) — покажу рецепт против пула и ожидание по актам.</div>
      <table>
        <thead>
          <tr>
            <th>Древний</th><th>Режим</th><th>Карт в колоде</th><th>Пул (з/ж/с)</th><th>Часы Рока</th>
            <th>Рок с карт</th><th>Врата</th><th>Всплески</th><th>Слухи</th><th>Проблемы</th>
          </tr>
        </thead>
        <tbody>
          {decks.map(({ a, deck }) => (
            <tr key={a.id}>
              <td><a href="#" onClick={(e) => { e.preventDefault(); onPick(a.id); }}>{a.name}</a></td>
              <td>{deck.mode === 'recipe' ? 'рецепт' : deck.mode === 'scenario' ? 'сценарий' : '—'}</td>
              <td>{deck.size || ''}</td>
              <td>{['green', 'yellow', 'blue'].map((c) => deck.pool[c] ?? 0).join(' / ')}</td>
              <td>{a.doomClock || ''}</td>
              <td>{deck.cumulative.doom ? fmt(deck.cumulative.doom) : ''}</td>
              <td>{deck.cumulative.gates ? fmt(deck.cumulative.gates) : ''}</td>
              <td>{deck.cumulative.surge ? fmt(deck.cumulative.surge) : ''}</td>
              <td>{deck.cumulative.rumor ? fmt(deck.cumulative.rumor) : ''}</td>
              <td className={deck.warnings.length ? 'danger' : 'hint'}>{deck.warnings.join('; ') || 'ок'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
