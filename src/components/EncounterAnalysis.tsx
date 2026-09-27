import { useMemo, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listContentBulk, type Meta } from '@/lib/api';
import type { ContentRecord } from '@/lib/types';
import { splitTags, matchAxes } from '@/lib/match';
import { SKILL_RU, VERB_RU, classify, slotsOf, titleOf, type Slot } from '@/lib/encounter-stats';

// Анализ одной встречи — рабочий инструмент автора, а не справка по кубам:
//   1. шанс успеха по РЕАЛЬНЫМ сыщикам каталога (пул = навык + модификатор);
//   2. вес карты (награда/штраф/ожидаемая ценность) против соседей по контексту;
//   3. линт механики — то, что движок молча пропускает (вид вместо id состояния,
//      трейт без карт, чужая локация, неизвестный глагол);
//   4. вводка против навыка — грубая эвристика по глаголам последнего абзаца;
//   5. соседи по контексту с их проверками и весом — дубли видно сразу.
// Данные — полные записи через /admin/content/bulk (кэш react-query общий с аналитикой).

const PASS_PER_DIE = 1 / 3;                 // d6, успех на 5–6
const passProb = (pool: number): number => 1 - Math.pow(1 - PASS_PER_DIE, Math.max(1, pool));
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const fmt = (x: number): string => (Math.round(x * 10) / 10).toString();
const axisCompat = (a: string, b: string): boolean => a === '' || b === '' || a === b;
const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

// ── Сыщики ────────────────────────────────────────────────────────────────────

interface Investigator { id: string; name: string; skills: Record<string, number> }

function investigatorsOf(records: ContentRecord[]): Investigator[] {
  return records
    .filter((r) => r.status === 'published' && r.data['skills'] && typeof r.data['skills'] === 'object')
    .map((r) => {
      // Имя лежит по ключу перевода INV_<ID>_NAME — берём первый ключ на _NAME (как pickList в relay).
      const ru = (r.i18n['ru'] ?? r.i18n['en'] ?? {}) as Record<string, unknown>;
      const nameKey = Object.keys(ru).find((k) => /_NAME$/.test(k));
      const name = String((nameKey && ru[nameKey]) || r.data['displayName'] || r.id);
      return { id: r.id, name, skills: r.data['skills'] as Record<string, number> };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Шанс успеха проверки для каждого сыщика (по возрастанию). */
function rosterOdds(inv: Investigator[], skill: string, modifier: number) {
  return inv
    .map((i) => {
      const base = Number(i.skills[skill] ?? 0);
      const pool = Math.max(1, base + modifier);      // движок: пул не меньше 1 куба
      return { name: i.name, base, pool, p: passProb(pool) };
    })
    .sort((a, b) => a.p - b.p);
}

// ── Вес карты ─────────────────────────────────────────────────────────────────

interface Weight { reward: number; costOnSuccess: number; penalty: number }

function weightOf(slot: Slot): Weight {
  let reward = 0, costOnSuccess = 0, penalty = 0;
  for (const e of slot.onSuccess) {
    const c = classify(e.verb);
    if (c === 'reward') reward += e.amount;
    if (c === 'penalty') costOnSuccess += e.amount;
  }
  for (const e of slot.onFailure) if (classify(e.verb) === 'penalty') penalty += e.amount;
  return { reward, costOnSuccess, penalty };
}

/** Ожидаемая ценность слота при шансе успеха p: успех даёт награду минус цену, провал — штраф. */
const expectedValue = (w: Weight, p: number): number => p * (w.reward - w.costOnSuccess) - (1 - p) * w.penalty;

/** Медианный по ростеру шанс успеха проверки слота (нет проверки → 1: эффекты применяются всегда). */
function medianOdds(inv: Investigator[], slot: Slot): number {
  if (!slot.test) return 1;
  if (inv.length === 0) return passProb(3);
  return median(rosterOdds(inv, slot.test.skill, slot.test.modifier).map((o) => o.p));
}

interface CardWeight { id: string; title: string; test: string; reward: number; penalty: number; ev: number }

function cardWeight(rec: ContentRecord, inv: Investigator[]): CardWeight {
  const slots = slotsOf(rec);
  let reward = 0, penalty = 0, ev = 0;
  const tests: string[] = [];
  for (const s of slots) {
    const w = weightOf(s);
    reward += w.reward;
    penalty += w.penalty + w.costOnSuccess;
    ev += expectedValue(w, medianOdds(inv, s));
    if (s.test) tests.push(`${SKILL_RU[s.test.skill] ?? s.test.skill} ${s.test.modifier > 0 ? '+' : ''}${s.test.modifier || 0}`);
  }
  return { id: rec.id, title: titleOf(rec), test: tests.join(' · ') || '—', reward, penalty, ev };
}

// ── Линт механики ─────────────────────────────────────────────────────────────

type Node = Record<string, unknown>;

/** Все узлы-эффекты программы (любая вложенность) с путём для сообщения. */
function walkNodes(program: unknown, path: string, out: { node: Node; path: string }[] = []): { node: Node; path: string }[] {
  if (!Array.isArray(program)) return out;
  program.forEach((n, i) => {
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    const here = `${path}[${i}]`;
    if (typeof node['do'] === 'string') out.push({ node, path: here });
    for (const k of ['do', 'group', 'onPass', 'onFail', 'then', 'effect']) {
      if (Array.isArray(node[k])) walkNodes(node[k], `${here}.${k}`, out);
    }
    if (Array.isArray(node['choice'])) (node['choice'] as unknown[]).forEach((b, j) => walkNodes([b], `${here}.choice[${j}]`, out));
    if (Array.isArray(node['dieRoll'])) (node['dieRoll'] as Node[]).forEach((f, j) => walkNodes(f?.['then'], `${here}.dieRoll[${j}]`, out));
  });
  return out;
}

interface Catalogs {
  assetTraits: Set<string>; spellTraits: Set<string>; artifactTraits: Set<string>;
  artifactIds: Set<string>; locationIds: Set<string>;
}

function traitsOf(records: ContentRecord[]): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    if (r.status !== 'published') continue;
    const t = r.data['traits'];
    if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x);
  }
  return out;
}

function lint(rec: ContentRecord, meta: Meta | undefined, cat: Catalogs): string[] {
  const out: string[] = [];
  const verbs = new Set(meta?.dsl?.actionVerbs ?? []);
  const skills = new Set(meta?.dsl?.skills ?? []);
  const conditions = new Set(meta?.dsl?.conditions ?? []);
  const kinds = new Set(meta?.dsl?.conditionKinds ?? []);
  const d = rec.data;
  const slots: [string, unknown][] = rec.kind === 'gate' || rec.kind === 'mystery'
    ? [['stage1', d['stage1']], ['successBranch', d['successBranch']], ['failureBranch', d['failureBranch']]]
    : [['', d]];

  for (const [slotName, container] of slots) {
    if (!container || typeof container !== 'object') continue;
    const c = container as Node;
    const prefix = slotName ? `${slotName}.` : '';
    const test = c['test'] as Node | undefined;
    if (test) {
      if (!skills.has(String(test['skill']))) out.push(`${prefix}test: неизвестный навык «${String(test['skill'])}»`);
      const mod = Number(test['modifier'] ?? 0);
      if (mod < -3 || mod > 2) out.push(`${prefix}test: модификатор ${mod} вне обычного диапазона −3…+2`);
    }
    const succ = Array.isArray(c['onSuccess']) ? (c['onSuccess'] as unknown[]) : [];
    const fail = Array.isArray(c['onFailure']) ? (c['onFailure'] as unknown[]) : [];
    if (test && succ.length === 0 && fail.length === 0) out.push(`${prefix}проверка есть, а последствий нет ни в одной ветке`);

    for (const { node, path } of [...walkNodes(succ, `${prefix}onSuccess`), ...walkNodes(fail, `${prefix}onFailure`)]) {
      const verb = String(node['do']);
      const at = `${path} ${verb}`;
      if (verbs.size && !verbs.has(verb)) { out.push(`${at}: неизвестный глагол — движок его не выполнит`); continue; }
      const cond = node['condition'];
      if (typeof cond === 'string' && cond) {
        if (kinds.has(cond)) out.push(`${at}: «${cond}» — это ВИД состояния, а не карта; движок пропустит. Нужно kind: "${cond}"`);
        else if (cond === 'delayed') out.push(`${at}: «delayed» не состояние — используй глагол becomeDelayed`);
        else if (conditions.size && !conditions.has(cond)) out.push(`${at}: неизвестное состояние «${cond}»`);
      }
      const kind = node['kind'];
      if ((verb === 'gainCondition' || verb === 'loseCondition') && typeof kind === 'string' && kind && kinds.size && !kinds.has(kind)) {
        out.push(`${at}: неизвестный вид состояния «${kind}»`);
      }
      const trait = node['trait'];
      if (typeof trait === 'string' && trait) {
        const pool = verb.includes('Spell') ? cat.spellTraits : verb.includes('Artifact') ? cat.artifactTraits : verb.includes('Asset') ? cat.assetTraits : null;
        if (pool && pool.size && !pool.has(trait)) {
          out.push(`${at}: под трейт «${trait}» нет ни одной опубликованной карты — выдастся случайная без фильтра`);
        }
      }
      if (verb === 'gainArtifact' && typeof node['artifact'] === 'string' && node['artifact'] && !cat.artifactIds.has(String(node['artifact']))) {
        out.push(`${at}: нет артефакта «${String(node['artifact'])}»`);
      }
      const where = node['where'];
      if (typeof where === 'string' && where && where !== 'self' && where !== 'marked' && cat.locationIds.size && !cat.locationIds.has(where)) {
        out.push(`${at}: where «${where}» — не id локации`);
      }
      const loc = node['location'];
      if (verb === 'placeRumor' && typeof loc === 'string' && loc && cat.locationIds.size && !cat.locationIds.has(loc)) {
        out.push(`${at}: location «${loc}» — не id локации`);
      }
      if ((verb === 'improveSkill' || verb === 'impairSkill') && !skills.has(String(node['skill']))) {
        out.push(`${at}: неизвестный навык «${String(node['skill'])}»`);
      }
    }
  }
  return out;
}

// ── Вводка против навыка ──────────────────────────────────────────────────────

// Глаголы проверки в последнем абзаце вводки. Считаем попадания по каждому навыку,
// берём лидера; ничья или пусто — молчим. Эвристика: показываем как «похоже на».
const SKILL_CUES: Record<string, RegExp[]> = {
  influence:   [/уговор/i, /убед/i, /разговор/i, /выторг/i, /договор/i, /торгу/i, /упрос/i, /подбира\w* слова/i, /заговор/i, /вмешат/i],
  observation: [/вглядыва/i, /всматрива/i, /замет/i, /разгляд/i, /наблюда/i, /след[ия]/i, /высмотр/i, /рассмотр/i, /не выда/i],
  lore:        [/понять/i, /расшифр/i, /вычисл/i, /вспомн/i, /формул/i, /выкладк/i, /прочит/i, /разобрать/i, /оккульт/i, /памят/i],
  will:        [/удержать/i, /не поддат/i, /не согласит/i, /устоя/i, /заставля\w* себя/i, /стараетесь не/i, /собственн\w* такт/i],
  strength:    [/расталкива/i, /вырвать/i, /догнать/i, /оттолк/i, /удержать\s+\w*\s*руками/i, /силой/i],
};

function guessSkill(text: string): { skill: string; hits: number } | null {
  const lastPara = text.trim().split(/\n\s*\n/).filter(Boolean).pop() ?? '';
  const scores = Object.entries(SKILL_CUES).map(([skill, res]) => ({ skill, hits: res.filter((re) => re.test(lastPara)).length }));
  scores.sort((a, b) => b.hits - a.hits);
  const top = scores[0]!;
  if (top.hits === 0 || (scores[1] && scores[1].hits === top.hits)) return null;
  return top;
}

function lastParagraph(text: string): string {
  return text.trim().split(/\n\s*\n/).filter(Boolean).pop() ?? '';
}

// ── Компонент ─────────────────────────────────────────────────────────────────

function useBulk(type: string) {
  return useQuery({
    queryKey: ['content', 'bulk', type],
    queryFn: () => listContentBulk({ type }),
    staleTime: 60_000,
  });
}

// Распределение ростера по размеру пула: одна полоска на пул (шанс от пула и
// зависит), длина — сколько сыщиков, имена — в подсказке. Медианный пул подсвечен.
function PoolHistogram({ odds, median: med }: { odds: { name: string; pool: number; p: number }[]; median: number }) {
  const byPool = new Map<number, { p: number; names: string[] }>();
  for (const o of odds) {
    const b = byPool.get(o.pool) ?? { p: o.p, names: [] };
    b.names.push(o.name);
    byPool.set(o.pool, b);
  }
  const rows = [...byPool.entries()].sort((a, b) => a[0] - b[0]);
  const max = Math.max(1, ...rows.map(([, b]) => b.names.length));
  const cell: CSSProperties = { fontSize: 12, color: '#a89f8c', whiteSpace: 'nowrap' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr max-content', gap: '3px 10px', alignItems: 'center', marginTop: 6 }}>
      {rows.map(([pool, b]) => {
        const isMedian = Math.abs(b.p - med) < 0.001;
        return [
          <div key={`l${pool}`} style={{ ...cell, color: isMedian ? '#e9d39a' : cell.color }}>
            {pool} куб. · <span style={b.p < 0.5 ? { color: '#c4756a' } : b.p >= 0.8 ? { color: '#4db870' } : undefined}>{pct(b.p)}</span>
          </div>,
          <div key={`b${pool}`} title={b.names.join(', ')} style={{ height: 12, background: '#1c1729', borderRadius: 4, overflow: 'hidden', cursor: 'help' }}>
            <div style={{ width: `${(b.names.length / max) * 100}%`, height: '100%', background: isMedian ? '#c7a84a' : '#6b5a2e', borderRadius: 4 }} />
          </div>,
          <div key={`n${pool}`} style={cell} title={b.names.join(', ')}>{b.names.length} {plural(b.names.length, 'сыщик', 'сыщика', 'сыщиков')}</div>,
        ];
      })}
      <div style={{ ...cell, gridColumn: '1 / -1', color: '#7a7060' }}>Наведи на полоску — имена. Золотом — медианный пул.</div>
    </div>
  );
}


export function EncounterAnalysis(
  { rec, meta, onClose }: { rec: ContentRecord; meta: Meta | undefined; onClose: () => void },
) {
  const encounters = useBulk('encounter');
  const investigators = useBulk('investigator');
  const assets = useBulk('asset');
  const spells = useBulk('spell');
  const artifacts = useBulk('artifact');

  const m = splitTags(rec.tags);
  const axes = matchAxes(rec.type, rec.kind);
  const slots = slotsOf(rec);
  const inv = useMemo(() => investigatorsOf(investigators.data?.records ?? []), [investigators.data]);

  // Контекст: карты того же вида и тира, совместимые по осям (как buildCorpusCards).
  const isPinned = m.location !== '';
  const ancSpecific = m.ancient !== '' && m.ancient !== 'any';
  const siblings: ContentRecord[] = useMemo(() => (encounters.data?.records ?? []).filter((c) => {
    if (c.status !== 'published' || c.kind !== rec.kind) return false;
    const cm = splitTags(c.tags);
    if (isPinned ? cm.location !== m.location : cm.location !== '') return false;
    const cAncSpec = cm.ancient !== '' && cm.ancient !== 'any';
    if (ancSpecific ? cm.ancient !== m.ancient : cAncSpec) return false;
    return axisCompat(m.loc, cm.loc) && axisCompat(m.world, cm.world);
  }), [encounters.data, rec.kind, m.location, m.loc, m.world, m.ancient, isPinned, ancSpecific]);

  const mine = cardWeight(rec, inv);
  const others = siblings.filter((c) => c.id !== rec.id).map((c) => cardWeight(c, inv));
  const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const deck = { reward: avg(others.map((o) => o.reward)), penalty: avg(others.map((o) => o.penalty)), ev: avg(others.map((o) => o.ev)) };

  const cat: Catalogs = {
    assetTraits: traitsOf(assets.data?.records ?? []),
    spellTraits: traitsOf(spells.data?.records ?? []),
    artifactTraits: traitsOf(artifacts.data?.records ?? []),
    artifactIds: new Set((artifacts.data?.records ?? []).filter((r) => r.status === 'published').map((r) => r.id)),
    locationIds: new Set((meta?.locations ?? []).map((l) => l.id)),
  };
  const problems = lint(rec, meta, cat);

  // Вводка против навыка — только для flat-карт (у ветвящихся вводка одна на три проверки).
  const ruMain = String(((rec.i18n['ru'] ?? {}) as Record<string, unknown>)['mainText'] ?? '');
  const flatTest = rec.kind !== 'gate' && rec.kind !== 'mystery' ? slots[0]?.test ?? null : null;
  const guess = flatTest && ruMain ? guessSkill(ruMain) : null;
  const textMismatch = guess && flatTest && guess.skill !== flatTest.skill;

  const locName = (id: string) => meta?.locations.find((l) => l.id === id)?.name ?? id;
  const ancName = (id: string) => (id === 'any' ? 'любой' : (meta?.ancients.find((a) => a.id === id)?.name ?? id));
  const ctx: string[] = [rec.kind];
  if (axes.location && m.location) ctx.push(`только ${locName(m.location)}`);
  else if (axes.loc) ctx.push(m.loc || 'любой тип локации');
  if (axes.world) ctx.push(m.world || 'любой Иной мир');
  ctx.push(m.ancient && m.ancient !== 'any' ? ancName(m.ancient) : 'общая');

  const box: CSSProperties = {
    background: '#14111f', border: '1px solid #3d2e10', borderRadius: 8,
    padding: 24, maxWidth: 760, width: '92%', maxHeight: '88vh', overflow: 'auto',
    color: '#d4cfc0', fontSize: 14, lineHeight: 1.5,
  };
  const head: CSSProperties = { color: '#c7a84a', marginTop: 18, marginBottom: 6 };
  const hint: CSSProperties = { color: '#7a7060', fontSize: 12, marginTop: 4 };
  const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
  const th: CSSProperties = { color: '#7a7060', textAlign: 'left', fontWeight: 500, padding: '2px 6px' };
  const td: CSSProperties = { padding: '2px 6px', borderTop: '1px solid #221c30' };
  const good = { color: '#4db870' };
  const bad = { color: '#c4756a' };
  const delta = (x: number, base: number) => (
    <span style={{ color: '#7a7060' }}> (в колоде {fmt(base)}{x - base > 0.05 ? ', выше' : x - base < -0.05 ? ', ниже' : ''})</span>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={box}>
        <h3 style={{ color: '#c7a84a', marginTop: 0, marginBottom: 2 }}>📊 {titleOf(rec)}</h3>
        <div style={hint}>Выпадает: {ctx.join(' · ')}</div>

        {/* 1. Шанс успеха по сыщикам */}
        <h4 style={head}>Шанс успеха по сыщикам</h4>
        {slots.filter((s) => s.test).length === 0 && <p style={{ margin: 0 }}>Проверки в механике нет.</p>}
        {slots.filter((s) => s.test).map((s) => {
          const t = s.test!;
          const odds = rosterOdds(inv, t.skill, t.modifier);
          const ps = odds.map((o) => o.p);
          const worst = odds[0]; const best = odds[odds.length - 1];
          return (
            <div key={s.label} style={{ marginBottom: 8 }}>
              <div>
                {slots.length > 1 ? `${s.label}: ` : ''}<b>{SKILL_RU[t.skill] ?? t.skill}</b>
                {t.modifier ? ` ${t.modifier > 0 ? '+' : ''}${t.modifier}` : ''}
                {odds.length > 0 && (
                  <> — от <span style={bad}>{pct(worst!.p)}</span> ({worst!.name}, {worst!.pool} куб.)
                    {' '}до <span style={good}>{pct(best!.p)}</span> ({best!.name}, {best!.pool} куб.), медиана {pct(median(ps))}</>
                )}
              </div>
              {odds.length > 0 && <PoolHistogram odds={odds} median={median(ps)} />}
              {investigators.isLoading && <div style={hint}>Сыщики загружаются…</div>}
            </div>
          );
        })}
        <p style={hint}>Пул = навык сыщика + модификатор, не меньше 1 куба; успех на 5–6, проверка пройдена при ≥1 успехе. Без учёта состояний и карт.</p>

        {/* 2. Вес против колоды */}
        <h4 style={head}>Вес карты</h4>
        <div>Награда за успех: <b>{mine.reward}</b>{others.length > 0 && delta(mine.reward, deck.reward)}</div>
        <div>Штраф (провал + цена успеха): <b>{mine.penalty}</b>{others.length > 0 && delta(mine.penalty, deck.penalty)}</div>
        <div>Ожидаемая ценность: <b style={mine.ev < 0 ? bad : good}>{mine.ev > 0 ? '+' : ''}{fmt(mine.ev)}</b>{others.length > 0 && delta(mine.ev, deck.ev)}</div>
        <p style={hint}>Награда и штраф — суммы amount по классам эффектов. Ожидаемая ценность = p·(награда − цена успеха) − (1−p)·штраф, p — медианный шанс по ростеру. «В колоде» — среднее по {others.length} соседям контекста.</p>

        {/* 3. Линт */}
        <h4 style={head}>Линт механики</h4>
        {problems.length === 0
          ? <p style={{ margin: 0, ...good }}>Проблем не найдено.</p>
          : <ul style={{ margin: 0, paddingLeft: 18, ...bad }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

        {/* 4. Вводка против навыка */}
        {flatTest && (
          <>
            <h4 style={head}>Вводка против навыка</h4>
            {!ruMain && <p style={{ margin: 0 }}>Русской вводки нет.</p>}
            {ruMain && !guess && <p style={{ margin: 0, color: '#7a7060' }}>По глаголам последнего абзаца навык не угадывается.</p>}
            {guess && !textMismatch && <p style={{ margin: 0, ...good }}>Текст читается как {SKILL_RU[guess.skill]}, проверка — {SKILL_RU[flatTest.skill]}. Совпадает.</p>}
            {textMismatch && guess && (
              <>
                <p style={{ margin: 0, ...bad }}>Текст читается как <b>{SKILL_RU[guess.skill]}</b>, а проверка — <b>{SKILL_RU[flatTest.skill]}</b>.</p>
                <p style={{ ...hint, fontStyle: 'italic' }}>«{lastParagraph(ruMain)}»</p>
              </>
            )}
            <p style={hint}>Эвристика по глаголам («уговорить» — Влияние, «вглядываетесь» — Внимание, «расшифровать» — Знание, «удержать» — Воля, «вырвать» — Сила). Подсказка, не приговор.</p>
          </>
        )}

        {/* 5. Соседи */}
        <h4 style={head}>Соседи по контексту ({siblings.length})</h4>
        {encounters.isLoading && <p style={{ margin: 0 }}>Загрузка…</p>}
        {siblings.length > 0 && (
          <table style={table}>
            <thead><tr><th style={th}>Карта</th><th style={th}>Проверка</th><th style={th}>Награда</th><th style={th}>Штраф</th><th style={th}>ОЦ</th></tr></thead>
            <tbody>
              {[mine, ...others].sort((a, b) => b.ev - a.ev).map((c) => (
                <tr key={c.id} style={c.id === rec.id ? { color: '#e9d39a', background: '#1c1729' } : undefined}>
                  <td style={td}>{c.title}</td>
                  <td style={td}>{c.test}</td>
                  <td style={td}>{c.reward}</td>
                  <td style={td}>{c.penalty}</td>
                  <td style={{ ...td, ...(c.ev < 0 ? bad : good) }}>{c.ev > 0 ? '+' : ''}{fmt(c.ev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={hint}>Одинаковая проверка у нескольких соседей — повод развести модификаторы. Нейтральные глаголы ({Object.keys(VERB_RU).filter((v) => classify(v) === 'neutral').map((v) => VERB_RU[v]).join(', ')}) в вес не входят.</p>

        <div style={{ marginTop: 18, textAlign: 'right' }}>
          <button type="button" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
