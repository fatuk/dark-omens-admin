import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listContentBulk, type Meta } from '@/lib/api';
import type { ContentRecord } from '@/lib/types';
import { SKILL_RU, VERB_RU, titleOf } from '@/lib/encounter-stats';
import {
  analyzeDeck, mythosRow, COLOR_RU, COLORS, METRICS, SECTIONS, SUBTYPE_RU, SYMBOLS,
  type MetricKey, type MythosRow, type Recipe,
} from '@/lib/mythos-stats';
import {
  investigatorsOf, median, PoolHistogram, rosterOdds, walkNodes,
} from '@/components/EncounterAnalysis';

// Анализ одной карты Мифов — пара к EncounterAnalysis, инлайн в редакторе:
//   1. вес против своего цвета у того же Древнего (символы, Рок, урон, награды);
//   2. место в колоде: шанс попасть в партию по рецепту / акт сценарной колоды;
//   3. Слух: таймер, исход, способ и проверка решения;
//   4. проверки — шанс успеха по реальным сыщикам каталога;
//   5. линт механики — то, что движок или сборка колоды молча пропустят;
//   6. соседи — карты того же Древнего и цвета.
// Механика — из буфера конструктора: в колоду подставляем живую версию карты.

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const fmt = (x: number): string => (Math.round(x * 10) / 10).toString();

function useBulk(type: string) {
  return useQuery({
    queryKey: ['content', 'bulk', type],
    queryFn: () => listContentBulk({ type }),
    staleTime: 60_000,
  });
}

const SOLVE_RU: Record<string, string> = {
  gateClose: 'закрыть врата-портал',
  encounter: 'встреча на клетке слуха',
  monsterDefeated: 'победить заспауненного монстра',
  toughnessOnCard: 'стойкость монстров на карте',
};

const ACT_COLORS = ['1', '2', '3'];

type Node = Record<string, unknown>;

function lint(
  rec: ContentRecord, row: MythosRow, peers: MythosRow[], meta: Meta | undefined, deckMode: string,
): string[] {
  const out: string[] = [];
  const verbs = new Set(meta?.dsl?.actionVerbs ?? []);
  const skills = new Set(meta?.dsl?.skills ?? []);
  const d = rec.data as Node;

  if (!row.ancient) out.push('нет тега ancient:<id> — карта не попадёт ни в одну колоду Древнего');
  if (!(COLORS as readonly string[]).includes(row.color)) out.push(`цвет «${row.color}» — не green/yellow/blue; рецепт его не возьмёт`);
  if (rec.status !== 'published') out.push('черновик — в колоду попадают только опубликованные карты');

  // Сценарный режим включается, если у ЛЮБОЙ карты Древнего есть data.act.
  if (row.act >= 1 && deckMode === 'recipe') {
    out.push('у карты задан data.act, а у остальных карт Древнего нет — при публикации вся колода переключится в сценарный режим и рецепт перестанет работать');
  }
  if (row.act < 1 && deckMode === 'scenario') {
    out.push('колода Древнего сценарная (у карт задан data.act), а у этой карты акта нет — в колоду она не попадёт');
  }

  const sections: [string, unknown][] = SECTIONS.map((s) => [s.label, (() => {
    const r = (d['rumor'] ?? {}) as Node;
    if (s.key === 'onDraw') return d['onDraw'] ?? d['onReveal'];
    if (s.key === 'whileInPlay') return d['whileInPlay'] ?? d['ongoing'];
    if (s.key === 'rumorExpire') return r['onExpire'];
    return [...(Array.isArray(d['onReckoning']) ? d['onReckoning'] : []), ...(Array.isArray(r['onReckoning']) ? r['onReckoning'] : [])];
  })()]);
  for (const [label, program] of sections) {
    for (const { node, path } of walkNodes(program, '')) {
      const verb = String(node['do']);
      if (verbs.size && !verbs.has(verb)) out.push(`${label}${path} ${verb}: неизвестный глагол — движок его не выполнит`);
      if ((verb === 'improveSkill' || verb === 'impairSkill') && skills.size && !skills.has(String(node['skill']))) {
        out.push(`${label}${path} ${verb}: неизвестный навык «${String(node['skill'])}»`);
      }
    }
  }
  for (const c of row.checks) {
    if (skills.size && !skills.has(c.skill)) out.push(`проверка: неизвестный навык «${c.skill}»`);
  }

  if (row.isRumor) {
    const rumor = d['rumor'] as Node;
    const solve = (rumor['solve'] ?? {}) as Node;
    if (!solve['kind']) out.push('Слух без способа решения (rumor.solve.kind) — развеять его нельзя');
    if (solve['kind'] === 'encounter' && !solve['test']) out.push('Слух решается встречей, но проверка решения не задана (rumor.solve.test)');
    const expire = Array.isArray(rumor['onExpire']) ? rumor['onExpire'] : [];
    if (row.rumorTokens > 0 && expire.length === 0) out.push('у Слуха таймер, но при истечении ничего не происходит (rumor.onExpire пуст)');
    if (row.rumorTokens === 0 && !rumor['doomTrigger'] && !solve['progress']) out.push('Слух без таймера, без порога Рока и без прогресса — он ничем не грозит');
  }

  // Профиль цвета у того же Древнего: символ есть у ≥2/3 соседей, а у карты нет — и наоборот.
  const sameColor = peers.filter((p) => p.color === row.color);
  if (sameColor.length >= 3) {
    for (const s of SYMBOLS) {
      const share = sameColor.filter((p) => p.symbols[s.key] > 0).length / sameColor.length;
      const has = row.symbols[s.key] > 0;
      if (!has && share >= 2 / 3) out.push(`нет символа «${s.label}», хотя он есть у ${pct(share)} карт этого цвета`);
      if (has && share <= 1 / 3) out.push(`символ «${s.label}» редкий для этого цвета (у ${pct(share)} карт)`);
    }
  }
  return out;
}

export function MythosCardAnalysis(
  { rec, meta, onClose, stale = false }:
  { rec: ContentRecord; meta: Meta | undefined; onClose: () => void; stale?: boolean },
) {
  const mythos = useBulk('mythos');
  const ancientsQ = useBulk('ancient');
  const investigators = useBulk('investigator');

  const row = mythosRow(rec);
  const inv = useMemo(() => investigatorsOf(investigators.data?.records ?? []), [investigators.data]);

  // Пул Древнего с ЖИВОЙ версией этой карты (правки в конструкторе сразу видны в колоде).
  const pool: MythosRow[] = useMemo(() => {
    const others = (mythos.data?.records ?? []).filter((c) => c.id !== rec.id).map(mythosRow);
    return [...others.filter((r) => row.ancient && r.ancient === row.ancient), row];
  }, [mythos.data, rec.id, row]);
  const peers = pool.filter((r) => r.id !== rec.id && r.status === 'published');

  const ancient = (ancientsQ.data?.records ?? []).find((a) => a.id === row.ancient);
  const recipe = ((ancient?.data?.['mythosDeck'] ?? {}) as Node)['byAct'] as Recipe | undefined;
  const doomClock = Number(ancient?.data?.['doomClock']) || 0;
  // Режим колоды БЕЗ этой карты — чтобы линт поймал «одна карта с act ломает рецепт».
  const deckWithout = analyzeDeck(pool.filter((r) => r.id !== rec.id), recipe ?? null);
  const deck = analyzeDeck(pool, recipe ?? null);

  const sameColor = peers.filter((p) => p.color === row.color);
  const avgOf = (k: MetricKey): number => {
    const m = METRICS.find((x) => x.key === k)!;
    return sameColor.length ? sameColor.reduce((a, r) => a + m.get(r), 0) / sameColor.length : 0;
  };
  const problems = lint(rec, row, peers, meta, deckWithout.mode);

  const ancName = meta?.ancients.find((a) => a.id === row.ancient)?.name ?? (row.ancient || '—');

  // Стиль — как у EncounterAnalysis.
  const box: CSSProperties = {
    background: '#14111f', border: '1px solid #3d2e10', borderRadius: 8,
    padding: '16px 20px', marginBottom: 16, color: '#d4cfc0', fontSize: 14, lineHeight: 1.5,
  };
  const head: CSSProperties = { color: '#c7a84a', marginTop: 18, marginBottom: 6 };
  const hint: CSSProperties = { color: '#7a7060', fontSize: 12, marginTop: 4 };
  const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
  const th: CSSProperties = { color: '#7a7060', textAlign: 'left', fontWeight: 500, padding: '2px 6px' };
  const td: CSSProperties = { padding: '2px 6px', borderTop: '1px solid #221c30' };
  const good = { color: '#4db870' };
  const bad = { color: '#c4756a' };

  // «6 (у жёлтых ⌀ 2, выше)» — сравнение с соседями цвета.
  const vs = (k: MetricKey, value: number, higherIsBad: boolean) => {
    if (sameColor.length === 0) return null;
    const base = avgOf(k);
    const diff = value - base;
    const tag = Math.abs(diff) < 0.05 ? '' : diff > 0 ? ', выше' : ', ниже';
    const col = Math.abs(diff) < 1 ? undefined : (diff > 0) === higherIsBad ? bad : good;
    return <span style={{ color: '#7a7060' }}> (⌀ цвета {fmt(base)}<span style={col}>{tag}</span>)</span>;
  };

  const actsOfColor = recipe
    ? ACT_COLORS.filter((a) => (Number(recipe[a]?.[row.color]) || 0) > 0)
    : [];

  return (
    <div style={box} data-analysis>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ color: '#c7a84a', marginTop: 0, marginBottom: 2 }}>📊 {titleOf(rec)}</h3>
        <button type="button" onClick={onClose}>Скрыть</button>
      </div>
      <div style={hint}>
        {COLOR_RU[row.color] ?? row.color} · {SUBTYPE_RU[row.subtype] ?? row.subtype} · {ancName}
        {row.act ? ` · акт ${row.act}` : ''} · пересчитывается по буферу конструктора
      </div>
      {stale && <div style={{ ...bad, fontSize: 12, marginTop: 4 }}>JSON механики сейчас невалиден — анализ по последней валидной версии.</div>}

      {/* 1. Вес против цвета */}
      <h4 style={head}>Вес против цвета</h4>
      <div>
        Символы при раскрытии:{' '}
        {SYMBOLS.filter((s) => row.symbols[s.key] > 0).map((s) => `${s.label}${row.symbols[s.key] > 1 ? ` ×${row.symbols[s.key]}` : ''}`).join(', ') || <span style={hint}>нет</span>}
      </div>
      <div>Врата: <b>{row.symbols.gates}</b>{vs('gates', row.symbols.gates, true)}</div>
      <div>Рок с карты: <b>{row.doom}</b>{vs('doom', row.doom, true)}</div>
      <div>Монстры (без всплеска): <b>{row.monsters}</b>{vs('monsters', row.monsters, true)}</div>
      <div>
        Урон сыщикам: <b>{row.harm}</b>{row.harm > 0 && row.perInvestigator && <span style={hint}> ×каждому</span>}
        {vs('harm', row.harm, true)}
      </div>
      <div>Награды сыщикам: <b>{row.rewards}</b>{vs('rewards', row.rewards, false)}</div>
      <p style={hint}>
        Сравнение — со средним по {sameColor.length} опубликованным картам того же цвета у {ancName}.
        У выбора (choice) суммируются все варианты — верхняя граница.
      </p>

      {/* 2. Место в колоде */}
      <h4 style={head}>Место в колоде</h4>
      {!row.ancient && <p style={{ margin: 0, ...bad }}>Без тега Древнего карта ни в одну колоду не попадёт.</p>}
      {row.ancient && deck.mode === 'recipe' && (
        <>
          <div>
            Цвет берут акты: <b>{actsOfColor.join(', ') || 'никакие'}</b> · нужно {deck.wantByColor[row.color] ?? 0},
            в пуле {deck.pool[row.color] ?? 0} → шанс попасть в партию{' '}
            <b style={(deck.drawChance[row.color] ?? 0) < 0.5 ? bad : good}>{pct(deck.drawChance[row.color] ?? 0)}</b>
          </div>
          {deck.warnings.map((w) => <div key={w} style={{ ...bad, fontSize: 13 }}>{w}</div>)}
          <p style={hint}>Рецепт {ancName}: {ACT_COLORS.map((a) => `акт ${a}: ${COLORS.map((c) => Number(recipe?.[a]?.[c]) || 0).join('/')}`).join(' · ')} (з/ж/с). Часы Рока: {doomClock || '—'}.</p>
        </>
      )}
      {row.ancient && deck.mode === 'scenario' && (
        <>
          <div>Сценарная колода: карта в акте <b>{row.act || '— (не попадёт)'}</b>{Number((rec.data as Node)['order']) > 0 ? `, место ${String((rec.data as Node)['order'])}` : ', тасуется внутри акта'}.</div>
          {deck.scenario.filter((s) => s.act === row.act).map((s) => (
            <div key={s.act} style={{ fontSize: 13 }}>
              Акт {s.act}: {s.rows.map((r, i) => (
                <span key={r.id} style={r.id === rec.id ? { color: '#e9d39a' } : undefined}>
                  {r.title} ({COLOR_RU[r.color] ?? r.color}){i < s.rows.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </div>
          ))}
        </>
      )}
      {row.ancient && deck.mode === 'none' && <p style={{ margin: 0 }}>У {ancName} нет рецепта (mythosDeck.byAct) — партия возьмёт шаблонную колоду.</p>}

      {/* 3. Слух */}
      {row.isRumor && (
        <>
          <h4 style={head}>Слух</h4>
          <div>
            {row.rumorTokens > 0 ? <>Таймер: <b>{row.rumorTokens}</b> жетона(ов) — истечёт через {row.rumorTokens} Расплат(ы)</> : <>Без таймера (прогресс / порог Рока)</>}
          </div>
          <div>
            Исход:{' '}
            {row.losesGame
              ? <b style={bad}>поражение</b>
              : row.effects.rumorExpire.length
                ? row.effects.rumorExpire.map((e) => `${VERB_RU[e.verb] ?? e.verb}${e.amount > 1 ? ` ${e.amount}` : ''}`).join(', ')
                : <span style={hint}>ничего</span>}
          </div>
          <div>Решение: {SOLVE_RU[row.rumorSolve] ?? (row.rumorSolve || <span style={bad}>не задано</span>)}</div>
        </>
      )}

      {/* 4. Проверки */}
      <h4 style={head}>Проверки</h4>
      {row.checks.length === 0 && <p style={{ margin: 0 }}>Проверок в механике нет.</p>}
      {row.checks.map((c, i) => {
        const odds = rosterOdds(inv, c.skill, c.modifier);
        const ps = odds.map((o) => o.p);
        const worst = odds[0]; const best = odds[odds.length - 1];
        const where = c.section === 'rumorSolve' ? 'решение Слуха' : (SECTIONS.find((s) => s.key === c.section)?.label ?? c.section);
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div>
              <span style={hint}>{where}: </span><b>{SKILL_RU[c.skill] ?? c.skill}</b>
              {c.modifier ? ` ${c.modifier > 0 ? '+' : ''}${c.modifier}` : ''}
              {odds.length > 0 && (
                <> — от <span style={bad}>{pct(worst!.p)}</span> ({worst!.name}, {worst!.pool} куб.)
                  {' '}до <span style={good}>{pct(best!.p)}</span> ({best!.name}, {best!.pool} куб.), медиана {pct(median(ps))}</>
              )}
            </div>
            {odds.length > 0 && <PoolHistogram odds={odds} median={median(ps)} />}
          </div>
        );
      })}
      {investigators.isLoading && <div style={hint}>Сыщики загружаются…</div>}

      {/* 5. Линт */}
      <h4 style={head}>Линт механики</h4>
      {problems.length === 0
        ? <p style={{ margin: 0, ...good }}>Проблем не найдено.</p>
        : <ul style={{ margin: 0, paddingLeft: 18, ...bad }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

      {/* 6. Соседи */}
      <h4 style={head}>Соседи: {COLOR_RU[row.color] ?? row.color} у {ancName} ({sameColor.length})</h4>
      {mythos.isLoading && <p style={{ margin: 0 }}>Загрузка…</p>}
      {sameColor.length > 0 && (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Карта</th><th style={th}>Вид</th><th style={th}>Символы</th>
              <th style={th}>Рок</th><th style={th}>Урон</th><th style={th}>Награды</th><th style={th}>Слух</th>
            </tr>
          </thead>
          <tbody>
            {[row, ...sameColor].map((r) => (
              <tr key={r.id} style={r.id === rec.id ? { color: '#e9d39a', background: '#1c1729' } : undefined}>
                <td style={td}>{r.id === rec.id ? r.title : <Link to={`/edit/${r.id}`}>{r.title}</Link>}</td>
                <td style={td}>{SUBTYPE_RU[r.subtype] ?? r.subtype}</td>
                <td style={td}>{SYMBOLS.filter((s) => r.symbols[s.key] > 0).map((s) => s.label).join(', ')}</td>
                <td style={td}>{r.doom || ''}</td>
                <td style={td}>{r.harm || ''}{r.harm > 0 && r.perInvestigator ? ' ×к.' : ''}</td>
                <td style={td}>{r.rewards || ''}</td>
                <td style={td}>{r.isRumor ? (r.rumorTokens ? `${r.rumorTokens} ⏳` : 'да') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={hint}>Похожие символы и урон у соседей — повод развести карты, чтобы цвет не повторялся.</p>
    </div>
  );
}
