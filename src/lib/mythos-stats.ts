// Аналитика карт Мифов: символы колоды (знамение, Расплата, врата, всплеск, улики),
// давление на Рок, урон сыщикам, проверки и Слухи — по карте, по цвету и по колоде
// Древнего (рецепт mythosDeck.byAct против карт его пула). Чистые функции — без React.
//
// Данные карты (type=mythos, см. MythosForm и relay campaign-corpus):
//   onDraw[] — при раскрытии; onReckoning[] — каждая Расплата, пока карта в игре;
//   whileInPlay[] — постоянный эффект; rumor{tokens, onReckoning[], onExpire[],
//   doomTrigger{effect[]}, solve{kind, test?}} — Слух (tokens 0 — без таймера, по прогрессу);
//   subtype event|ongoing|rumor; act/order — сценарная колода (стадия закреплена).
// Цвет — тег color:<c> или kind (как в relay mythosDeckFromCorpus).

import type { ContentRecord } from './types';
import { classify, flattenEffects, titleOf, type Effect } from './encounter-stats';

export const COLORS = ['green', 'yellow', 'blue'] as const;
export const COLOR_RU: Record<string, string> = { green: 'Зелёная', yellow: 'Жёлтая', blue: 'Синяя' };
export const SUBTYPE_RU: Record<string, string> = { event: 'Событие', ongoing: 'Длящаяся', rumor: 'Слух' };

/** Символы карты Мифов — то, что колода делает с полем при раскрытии. */
export const SYMBOLS = [
  { key: 'omen', label: 'Знамение', verbs: ['advanceOmen'] },
  { key: 'reckoning', label: 'Расплата', verbs: ['resolveReckoning'] },
  { key: 'gates', label: 'Врата', verbs: ['openGate'] },
  { key: 'surge', label: 'Всплеск', verbs: ['monsterSurge'] },
  { key: 'clues', label: 'Улики на поле', verbs: ['placeClue'] },
] as const;
export type SymbolKey = typeof SYMBOLS[number]['key'];

const DOOM_VERBS = new Set(['advanceDoom']);
const MONSTER_VERBS = new Set(['spawnMonster', 'toughenMonster']);
// Улики на поле — символ колоды, а не награда сыщику (во встречах placeClue — награда).
const BOARD_REWARD = new Set(['placeClue']);
// Урон сыщикам — штрафы из общей классификации, кроме «полевых» (Рок/врата/монстры/
// знамение/улики на поле): те считаются отдельными колонками.
const BOARD_PENALTY = new Set([
  'advanceDoom', 'advanceOmen', 'openGate', 'spawnMonster', 'placeEldritchToken', 'monsterSurge', 'toughenMonster',
]);

type Node = Record<string, unknown>;
const num = (v: unknown, fb: number): number => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

export interface MythosCheck { skill: string; modifier: number; section: string }

/** Проверки внутри программы: узел { test:"will", modifier } или { test:{skill, modifier} }. */
export function testsOf(program: unknown, section: string, out: MythosCheck[] = []): MythosCheck[] {
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    const t = node['test'];
    if (typeof t === 'string') out.push({ skill: t, modifier: num(node['modifier'], 0), section });
    else if (t && typeof t === 'object' && (t as Node)['skill']) {
      out.push({ skill: String((t as Node)['skill']), modifier: num((t as Node)['modifier'], 0), section });
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
  };
  walk(program);
  return out;
}

/** Есть ли в программе forEach — эффект бьёт по КАЖДОМУ сыщику (масштаб от числа игроков). */
function hasForEach(program: unknown): boolean {
  return JSON.stringify(program ?? []).includes('"forEach"');
}

export const SECTIONS = [
  { key: 'onDraw', label: 'При раскрытии' },
  { key: 'onReckoning', label: 'Расплата' },
  { key: 'whileInPlay', label: 'Пока в игре' },
  { key: 'rumorExpire', label: 'Исход Слуха' },
] as const;
export type SectionKey = typeof SECTIONS[number]['key'];

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function sectionProgram(d: Node, key: SectionKey): unknown[] {
  const rumor = (d['rumor'] ?? {}) as Node;
  if (key === 'onDraw') return arr(d['onDraw'] ?? d['onReveal']);
  if (key === 'whileInPlay') return arr(d['whileInPlay'] ?? d['ongoing']);
  // Исход Слуха: истечение таймера и порог Рока (doomTrigger) у Слуха без таймера.
  if (key === 'rumorExpire') {
    return [...arr(rumor['onExpire']), ...arr(((rumor['doomTrigger'] ?? {}) as Node)['effect'])];
  }
  // Расплата: и карты, и её Слуха (тиканье таймера, потеря улики и т.п.).
  return [...arr(d['onReckoning']), ...arr(rumor['onReckoning'])];
}

export interface MythosRow {
  id: string;
  title: string;
  status: string;
  ancient: string;
  season: string;
  color: string;
  subtype: string;
  act: number;                         // 0 — стадия не закреплена (берётся по рецепту)
  symbols: Record<SymbolKey, number>;  // сумма amount/count по символу (врата ×2 и т.п.)
  doom: number;                        // advanceDoom: при раскрытии + Расплата
  doomOnExpire: number;                // advanceDoom из rumor.onExpire (repeat — как 1)
  losesGame: boolean;                  // rumor.onExpire → loseGame
  monsters: number;                    // spawnMonster/toughenMonster (кроме всплеска)
  harm: number;                        // штрафы сыщикам (здоровье/рассудок/состояния/имущество…)
  rewards: number;                     // награды сыщикам
  perInvestigator: boolean;            // forEach — масштабируется числом сыщиков
  isRumor: boolean;
  rumorTokens: number;                 // 0 — Слух без таймера (решается прогрессом) или не Слух
  rumorSolve: string;
  checks: MythosCheck[];
  effects: Record<SectionKey, Effect[]>;
  tags: string[];
}

export function colorOf(rec: ContentRecord): string {
  const t = rec.tags.find((x) => x.startsWith('color:'));
  return t ? t.slice(6) : rec.kind;
}

function tagVal(rec: ContentRecord, pfx: string): string {
  const t = rec.tags.find((x) => x.startsWith(pfx + ':'));
  return t ? t.slice(pfx.length + 1) : '';
}

export function mythosRow(rec: ContentRecord): MythosRow {
  const d = rec.data as Node;
  const rumor = (d['rumor'] && typeof d['rumor'] === 'object' ? d['rumor'] : null) as Node | null;
  const effects = {} as Record<SectionKey, Effect[]>;
  for (const s of SECTIONS) effects[s.key] = flattenEffects(sectionProgram(d, s.key));

  const symbols = Object.fromEntries(SYMBOLS.map((s) => [s.key, 0])) as Record<SymbolKey, number>;
  for (const e of effects.onDraw) {
    for (const s of SYMBOLS) if ((s.verbs as readonly string[]).includes(e.verb)) symbols[s.key] += e.amount;
  }
  let doom = 0, monsters = 0, harm = 0, rewards = 0;
  for (const key of ['onDraw', 'onReckoning', 'whileInPlay'] as const) {
    for (const e of effects[key]) {
      if (DOOM_VERBS.has(e.verb)) doom += e.amount;
      if (MONSTER_VERBS.has(e.verb)) monsters += e.amount;
      const cls = classify(e.verb);
      if (cls === 'penalty' && !BOARD_PENALTY.has(e.verb)) harm += e.amount;
      if (cls === 'reward' && !BOARD_REWARD.has(e.verb)) rewards += e.amount;
    }
  }
  // Сценарные карты (демо) не размечают subtype — по умолчанию событие, Слух — по блоку rumor.
  const subtype = String(d['subtype'] ?? (rumor ? 'rumor' : 'event'));
  const checks: MythosCheck[] = [];
  for (const s of SECTIONS) testsOf(sectionProgram(d, s.key), s.key, checks);
  // Проверка решения Слуха (встреча на клетке слуха) — тоже проверка этой карты.
  testsOf([(rumor?.['solve'] ?? {}) as Node], 'rumorSolve', checks);

  return {
    id: rec.id, title: titleOf(rec), status: rec.status,
    ancient: tagVal(rec, 'ancient'), season: tagVal(rec, 'season'),
    color: colorOf(rec), subtype, act: num(d['act'], 0),
    symbols, doom,
    doomOnExpire: effects.rumorExpire.filter((e) => DOOM_VERBS.has(e.verb)).reduce((a, e) => a + e.amount, 0),
    losesGame: effects.rumorExpire.some((e) => e.verb === 'loseGame'),
    monsters, harm, rewards,
    perInvestigator: SECTIONS.some((s) => hasForEach(sectionProgram(d, s.key))),
    isRumor: !!rumor,
    rumorTokens: rumor ? num(rumor['tokens'], 0) : 0,
    rumorSolve: rumor ? String(((rumor['solve'] ?? {}) as Node)['kind'] ?? '') : '',
    checks, effects, tags: rec.tags,
  };
}

// ── Сводка по набору карт ─────────────────────────────────────────────────────

/** Метрики, которые усредняем по цвету и ожидаем в колоде. */
export const METRICS = [
  { key: 'omen', label: 'Знамение', get: (r: MythosRow) => r.symbols.omen },
  { key: 'reckoning', label: 'Расплата', get: (r: MythosRow) => r.symbols.reckoning },
  { key: 'gates', label: 'Врата', get: (r: MythosRow) => r.symbols.gates },
  { key: 'surge', label: 'Всплеск', get: (r: MythosRow) => r.symbols.surge },
  { key: 'clues', label: 'Улики на поле', get: (r: MythosRow) => r.symbols.clues },
  { key: 'doom', label: 'Рок', get: (r: MythosRow) => r.doom },
  { key: 'monsters', label: 'Монстры', get: (r: MythosRow) => r.monsters },
  { key: 'harm', label: 'Урон сыщикам', get: (r: MythosRow) => r.harm },
  { key: 'rewards', label: 'Награды', get: (r: MythosRow) => r.rewards },
  { key: 'rumor', label: 'Слухи', get: (r: MythosRow) => (r.isRumor ? 1 : 0) },
] as const;
export type MetricKey = typeof METRICS[number]['key'];

export interface ColorProfile {
  color: string;
  count: number;
  subtypes: Record<string, number>;
  /** Доля карт цвета, у которых символ есть (>0) — «профиль цвета». */
  share: Record<SymbolKey, number>;
  /** Среднее на карту по каждой метрике. */
  mean: Record<MetricKey, number>;
}

export interface VerbRow { verb: string; bySection: Record<SectionKey, { count: number; amount: number }>; details: Record<string, number> }

export interface MythosStats {
  cards: number;
  rows: MythosRow[];
  colors: ColorProfile[];
  verbs: VerbRow[];
  checks: number;
  bySkill: Record<string, { count: number; modSum: number }>;
  /** Карты, у которых символа нет, хотя у большинства (≥ 2/3) карт цвета он есть, — и наоборот. */
  outliers: { id: string; title: string; color: string; note: string }[];
}

function profile(color: string, rows: MythosRow[]): ColorProfile {
  const share = Object.fromEntries(SYMBOLS.map((s) => [s.key, 0])) as Record<SymbolKey, number>;
  const mean = Object.fromEntries(METRICS.map((m) => [m.key, 0])) as Record<MetricKey, number>;
  const subtypes: Record<string, number> = {};
  for (const r of rows) {
    subtypes[r.subtype] = (subtypes[r.subtype] ?? 0) + 1;
    for (const s of SYMBOLS) if (r.symbols[s.key] > 0) share[s.key] += 1;
    for (const m of METRICS) mean[m.key] += m.get(r);
  }
  const n = rows.length || 1;
  for (const s of SYMBOLS) share[s.key] /= n;
  for (const m of METRICS) mean[m.key] /= n;
  return { color, count: rows.length, subtypes, share, mean };
}

export function computeMythosStats(records: ContentRecord[]): MythosStats {
  const rows = records.map(mythosRow);
  const colorKeys = [...new Set([...COLORS, ...rows.map((r) => r.color)])];
  const colors = colorKeys
    .map((c) => profile(c, rows.filter((r) => r.color === c)))
    .filter((p) => p.count > 0);

  const verbMap = new Map<string, VerbRow>();
  const bySkill: Record<string, { count: number; modSum: number }> = {};
  let checks = 0;
  for (const r of rows) {
    for (const s of SECTIONS) {
      for (const e of r.effects[s.key]) {
        let v = verbMap.get(e.verb);
        if (!v) {
          v = {
            verb: e.verb, details: {},
            bySection: Object.fromEntries(SECTIONS.map((x) => [x.key, { count: 0, amount: 0 }])) as VerbRow['bySection'],
          };
          verbMap.set(e.verb, v);
        }
        v.bySection[s.key].count += 1;
        v.bySection[s.key].amount += e.amount;
        if (e.detail) v.details[e.detail] = (v.details[e.detail] ?? 0) + 1;
      }
    }
    for (const c of r.checks) {
      checks += 1;
      const b = (bySkill[c.skill] ??= { count: 0, modSum: 0 });
      b.count += 1;
      b.modSum += c.modifier;
    }
  }
  const total = (v: VerbRow): number => SECTIONS.reduce((a, s) => a + v.bySection[s.key].count, 0);
  const verbs = [...verbMap.values()].sort((a, b) => total(b) - total(a));

  // Отклонения от профиля цвета: символ есть у ≥2/3 карт цвета, а у этой нет (или
  // наоборот: есть у ≤1/3, а у этой есть). Только при ≥3 картах цвета — иначе шум.
  const outliers: MythosStats['outliers'] = [];
  for (const p of colors) {
    if (p.count < 3) continue;
    for (const r of rows.filter((x) => x.color === p.color)) {
      for (const s of SYMBOLS) {
        const has = r.symbols[s.key] > 0;
        if (!has && p.share[s.key] >= 2 / 3) {
          outliers.push({ id: r.id, title: r.title, color: r.color, note: `нет символа «${s.label}» (есть у ${Math.round(p.share[s.key] * 100)}% цвета)` });
        } else if (has && p.share[s.key] <= 1 / 3) {
          outliers.push({ id: r.id, title: r.title, color: r.color, note: `редкий для цвета символ «${s.label}» (у ${Math.round(p.share[s.key] * 100)}% цвета)` });
        }
      }
    }
  }

  return { cards: rows.length, rows, colors, verbs, checks, bySkill, outliers };
}

// ── Колода Древнего ───────────────────────────────────────────────────────────

export type Recipe = Record<string, Record<string, number>>;   // act → color → n

export interface DeckSlot {
  act: number;
  color: string;
  want: number;
  fresh: number;    // сколько ещё не использованных карт цвета к этому акту
  repeats: number;  // свои карты, но повтором (пул исчерпан прежними актами)
  padded: number;   // своих карт цвета нет вовсе → шаблонная заглушка
}

export interface DeckActSummary {
  act: number;
  size: number;
  expected: Record<MetricKey, number>;  // ожидание по случайной выборке из пула цвета
}

export interface DeckAnalysis {
  mode: 'recipe' | 'scenario' | 'none';
  size: number;
  slots: DeckSlot[];                   // recipe
  acts: DeckActSummary[];              // ожидания по актам
  cumulative: Record<MetricKey, number>;
  pool: Record<string, number>;        // карт пула по цвету
  wantByColor: Record<string, number>; // нужно рецептом по цвету
  /** Шанс карты попасть в партию (recipe): min(1, нужно / есть) по её цвету. */
  drawChance: Record<string, number>;
  /** Сценарная колода: карты по актам. */
  scenario: { act: number; rows: MythosRow[] }[];
  warnings: string[];
}

const zeroMetrics = (): Record<MetricKey, number> =>
  Object.fromEntries(METRICS.map((m) => [m.key, 0])) as Record<MetricKey, number>;

/** Колода Древнего тем же алгоритмом, что relay mythosDeckFromCorpus: сценарная
 *  (у карт data.act) — как есть; иначе по рецепту byAct с истощением пула по актам. */
export function analyzeDeck(pool: MythosRow[], recipe: Recipe | null | undefined): DeckAnalysis {
  const published = pool.filter((r) => r.status === 'published');
  const res: DeckAnalysis = {
    mode: 'none', size: 0, slots: [], acts: [], cumulative: zeroMetrics(),
    pool: {}, wantByColor: {}, drawChance: {}, scenario: [], warnings: [],
  };
  for (const r of published) res.pool[r.color] = (res.pool[r.color] ?? 0) + 1;
  const drafts = pool.length - published.length;
  if (drafts > 0) res.warnings.push(`${drafts} карт(ы) в черновике — в колоду не попадут`);

  if (published.some((r) => r.act >= 1)) {
    res.mode = 'scenario';
    for (const act of [1, 2, 3]) {
      const rows = published.filter((r) => r.act === act);
      const expected = zeroMetrics();
      for (const m of METRICS) expected[m.key] = rows.reduce((a, r) => a + m.get(r), 0);
      res.scenario.push({ act, rows });
      res.acts.push({ act, size: rows.length, expected });
      res.size += rows.length;
    }
    const loose = published.filter((r) => r.act < 1).length;
    if (loose > 0) res.warnings.push(`${loose} карт(ы) без data.act — в сценарную колоду не попадут`);
    // Рецепт при сценарной колоде игнорируется — сверяем, чтобы он не врал автору.
    if (recipe) {
      for (const act of [1, 2, 3]) {
        for (const color of COLORS) {
          const want = Number(recipe[String(act)]?.[color]) || 0;
          const have = published.filter((r) => r.act === act && r.color === color).length;
          if (want !== have) {
            res.warnings.push(`Акт ${act}, ${COLOR_RU[color]}: рецепт ${want}, сценарных карт ${have} (рецепт не используется)`);
          }
        }
      }
    }
  } else if (recipe) {
    res.mode = 'recipe';
    const used: Record<string, number> = {};
    for (const actKey of ['1', '2', '3']) {
      const act = Number(actKey);
      const counts = recipe[actKey] ?? {};
      const expected = zeroMetrics();
      let size = 0;
      for (const [color, n] of Object.entries(counts)) {
        const want = Number(n) || 0;
        if (want <= 0) continue;
        const have = res.pool[color] ?? 0;
        const fresh = Math.max(0, have - (used[color] ?? 0));
        const fromFresh = Math.min(want, fresh);
        const repeats = have > 0 ? want - fromFresh : 0;
        const padded = have > 0 ? 0 : want;
        used[color] = (used[color] ?? 0) + fromFresh;
        res.slots.push({ act, color, want, fresh, repeats, padded });
        res.wantByColor[color] = (res.wantByColor[color] ?? 0) + want;
        size += want;
        // Ожидание: каждая карта цвета равновероятна → want × среднее по цвету.
        const colorRows = published.filter((r) => r.color === color);
        if (colorRows.length > 0) {
          for (const m of METRICS) {
            expected[m.key] += want * (colorRows.reduce((a, r) => a + m.get(r), 0) / colorRows.length);
          }
        }
      }
      res.acts.push({ act, size, expected });
      res.size += size;
    }
    for (const [color, want] of Object.entries(res.wantByColor)) {
      const have = res.pool[color] ?? 0;
      res.drawChance[color] = have > 0 ? Math.min(1, want / have) : 0;
      if (have === 0) res.warnings.push(`${COLOR_RU[color] ?? color}: своих карт нет — ${want} слотов станут шаблонными заглушками`);
      else if (have < want) res.warnings.push(`${COLOR_RU[color] ?? color}: нужно ${want}, есть ${have} — ${want - have} повтор(а) в партии`);
    }
  }
  for (const a of res.acts) for (const m of METRICS) res.cumulative[m.key] += a.expected[m.key];
  return res;
}
