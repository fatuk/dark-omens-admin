// Массовая аналитика встреч: из полных записей (data) достаём проверки и эффекты
// веток, классифицируем на награды/штрафы и агрегируем. Чистые функции — без
// React, чтобы считать по любому отфильтрованному набору.
//
// Структура data по видам (см. EncounterAnalysis / relay recordSchema):
//   general/research: { test?, onSuccess[], onFailure[] } в корне;
//   gate/mystery:     { stage1:{test?, onSuccess?, onFailure?}, successBranch:{…}, failureBranch:{…} }.
// Эффекты — Effect-DSL: узел с `do`, либо структурный (choice / dieRoll / group /
// forEach / test с onPass/onFail) — обходим рекурсивно, listья считаем.

import type { ContentRecord } from './types';

export interface Check { slot: string; skill: string; modifier: number }
export interface Effect { verb: string; amount: number; detail: string }

export interface Slot {
  label: string;
  test: Check | null;
  onSuccess: Effect[];
  onFailure: Effect[];
}

export const SKILL_RU: Record<string, string> = {
  lore: 'Знание', influence: 'Влияние', observation: 'Внимание', strength: 'Сила', will: 'Воля',
};

export const VERB_RU: Record<string, string> = {
  gainClue: 'улика +', loseClue: 'улика −', spendClue: 'потратить улику',
  gainAsset: 'актив +', loseAsset: 'актив −', gainSpell: 'заклинание +', loseSpell: 'заклинание −',
  gainArtifact: 'артефакт +', loseArtifact: 'артефакт −', loseAllPossessions: 'всё имущество −',
  healHealth: 'здоровье +', loseHealth: 'здоровье −', healSanity: 'рассудок +', loseSanity: 'рассудок −',
  gainFocus: 'концентрация +', loseFocus: 'концентрация −', gainResource: 'ресурс +', loseResource: 'ресурс −',
  gainCondition: 'состояние', loseCondition: 'снять состояние', improveSkill: 'навык +', impairSkill: 'навык −',
  gainImprovement: 'улучшение', loseImprovement: 'улучшение −',
  closeGate: 'закрыть врата', openGate: 'открыть врата', discardGate: 'сбросить врата',
  spawnMonster: 'монстр', discardMonster: 'сбросить монстра', defeatMonster: 'победить монстра', damageMonster: 'урон монстру',
  moveMonster: 'переместить монстра',
  flipBack: 'карту на лицо', stayFlipped: 'карта остаётся перевёрнутой', solveMystery: 'решить Тайну',
  advanceDoom: 'рок +', retreatDoom: 'рок −', advanceOmen: 'знамение', becomeDelayed: 'задержан',
  move: 'переместить', gainTicket: 'билет +', loseTicket: 'билет −', extraAction: 'доп. действие',
  placeClue: 'улика на поле', placeEldritchToken: 'жетон Знамения', text: 'текст',
  // Мифы
  monsterSurge: 'всплеск монстров', resolveReckoning: 'Расплата', loseGame: 'поражение',
  discardEldritchToken: 'снять жетон Знамения', toughenMonster: 'усилить монстра',
  checkModifier: 'модификатор проверок', discardAllClues: 'сбросить все улики',
};

const REWARD = new Set([
  'gainClue', 'gainAsset', 'gainSpell', 'gainArtifact', 'healHealth', 'healSanity', 'gainFocus', 'gainResource',
  'loseCondition', 'improveSkill', 'gainImprovement', 'closeGate', 'discardGate', 'discardMonster', 'defeatMonster',
  'damageMonster', 'retreatDoom', 'gainTicket', 'extraAction', 'placeClue',
]);
const PENALTY = new Set([
  'loseClue', 'spendClue', 'loseAsset', 'loseSpell', 'loseArtifact', 'loseAllPossessions', 'loseHealth', 'loseSanity',
  'loseFocus', 'loseResource', 'gainCondition', 'impairSkill', 'loseImprovement', 'openGate', 'spawnMonster',
  'advanceDoom', 'advanceOmen', 'becomeDelayed', 'loseTicket', 'placeEldritchToken', 'discardAllClues',
  'monsterSurge', 'toughenMonster', 'loseGame',
]);

export type EffectClass = 'reward' | 'penalty' | 'neutral';
export function classify(verb: string): EffectClass {
  if (REWARD.has(verb)) return 'reward';
  if (PENALTY.has(verb)) return 'penalty';
  return 'neutral';
}

type Node = Record<string, unknown>;

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Плоский список листьев-эффектов из программы (любая вложенность). */
export function flattenEffects(program: unknown, out: Effect[] = []): Effect[] {
  if (!Array.isArray(program)) return out;
  for (const n of program) {
    if (!n || typeof n !== 'object') continue;
    const node = n as Node;
    if (typeof node['do'] === 'string') {
      const verb = node['do'] as string;
      const amount = num(node['amount'] ?? node['count'], 1);
      const detail = String(node['condition'] ?? node['trait'] ?? node['skill'] ?? node['stat'] ?? '');
      out.push({ verb, amount, detail });
    }
    if (Array.isArray(node['do'])) flattenEffects(node['do'], out);          // forEach
    if (Array.isArray(node['choice'])) for (const b of node['choice'] as unknown[]) flattenEffects([b], out);
    if (Array.isArray(node['group'])) flattenEffects(node['group'], out);
    if (Array.isArray(node['dieRoll'])) for (const f of node['dieRoll'] as Node[]) flattenEffects(f?.['then'], out);
    if (Array.isArray(node['onPass'])) flattenEffects(node['onPass'], out);
    if (Array.isArray(node['onFail'])) flattenEffects(node['onFail'], out);
    if (Array.isArray(node['then'])) flattenEffects(node['then'], out);
    if (Array.isArray(node['effect'])) flattenEffects(node['effect'], out);
  }
  return out;
}

function testOf(slot: string, container: unknown): Check | null {
  const t = (container as { test?: { skill?: string; modifier?: unknown } } | undefined)?.test;
  if (!t?.skill) return null;
  return { slot, skill: String(t.skill), modifier: num(t.modifier, 0) };
}

function slotOf(label: string, container: unknown): Slot | null {
  if (!container || typeof container !== 'object') return null;
  const c = container as Node;
  const slot: Slot = {
    label, test: testOf(label, c),
    onSuccess: flattenEffects(c['onSuccess']), onFailure: flattenEffects(c['onFailure']),
  };
  if (!slot.test && slot.onSuccess.length === 0 && slot.onFailure.length === 0) return null;
  return slot;
}

/** Разложить встречу на слоты (у general один, у gate/mystery до трёх). */
export function slotsOf(rec: ContentRecord): Slot[] {
  const d = rec.data;
  if (rec.kind === 'gate' || rec.kind === 'mystery') {
    return [
      slotOf('Стадия 1', d['stage1']),
      slotOf('Ветка успеха', d['successBranch']),
      slotOf('Ветка провала', d['failureBranch']),
    ].filter((s): s is Slot => s !== null);
  }
  const s = slotOf('Проверка', d);
  return s ? [s] : [];
}

// ── Агрегаты ─────────────────────────────────────────────────────────────────

export interface SkillStat {
  skill: string;
  count: number;
  byModifier: Record<string, number>;   // '-2'..'+2' → сколько
  avgModifier: number;
}

export interface VerbStat {
  verb: string;
  cls: EffectClass;
  success: { count: number; amount: number };   // в ветках успеха
  failure: { count: number; amount: number };   // в ветках провала
  details: Record<string, number>;              // condition/trait/skill → сколько
}

export interface EncounterRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  tags: string[];
  checks: Check[];
  rewardScore: number;    // сумма amount наград (успех) — грубая мера щедрости
  penaltyScore: number;   // сумма amount штрафов (провал + успех)
  slots: Slot[];
}

export interface Stats {
  encounters: number;
  byKind: Record<string, number>;
  withoutCheck: number;
  checks: number;
  skills: SkillStat[];
  verbs: VerbStat[];
  rows: EncounterRow[];
}

export function titleOf(rec: ContentRecord): string {
  const ru = (rec.i18n['ru'] ?? rec.i18n['en'] ?? {}) as Record<string, unknown>;
  const n = ru['name'] ?? ru['title'];
  return typeof n === 'string' && n ? n : rec.id;
}

export function computeStats(records: ContentRecord[]): Stats {
  const byKind: Record<string, number> = {};
  const skillMap = new Map<string, SkillStat>();
  const verbMap = new Map<string, VerbStat>();
  const rows: EncounterRow[] = [];
  let checks = 0;
  let withoutCheck = 0;

  const verbStat = (verb: string): VerbStat => {
    let v = verbMap.get(verb);
    if (!v) {
      v = { verb, cls: classify(verb), success: { count: 0, amount: 0 }, failure: { count: 0, amount: 0 }, details: {} };
      verbMap.set(verb, v);
    }
    return v;
  };

  for (const rec of records) {
    byKind[rec.kind] = (byKind[rec.kind] ?? 0) + 1;
    const slots = slotsOf(rec);
    const rowChecks: Check[] = [];
    let rewardScore = 0;
    let penaltyScore = 0;
    for (const s of slots) {
      if (s.test) {
        rowChecks.push(s.test);
        checks += 1;
        let st = skillMap.get(s.test.skill);
        if (!st) {
          st = { skill: s.test.skill, count: 0, byModifier: {}, avgModifier: 0 };
          skillMap.set(s.test.skill, st);
        }
        st.count += 1;
        const key = s.test.modifier > 0 ? `+${s.test.modifier}` : String(s.test.modifier);
        st.byModifier[key] = (st.byModifier[key] ?? 0) + 1;
        st.avgModifier += s.test.modifier;
      }
      for (const [branch, list] of [['success', s.onSuccess], ['failure', s.onFailure]] as const) {
        for (const e of list) {
          const v = verbStat(e.verb);
          v[branch].count += 1;
          v[branch].amount += e.amount;
          if (e.detail) v.details[e.detail] = (v.details[e.detail] ?? 0) + 1;
          if (v.cls === 'reward' && branch === 'success') rewardScore += e.amount;
          if (v.cls === 'penalty') penaltyScore += e.amount;
        }
      }
    }
    if (rowChecks.length === 0) withoutCheck += 1;
    rows.push({
      id: rec.id, title: titleOf(rec), kind: rec.kind, status: rec.status, tags: rec.tags,
      checks: rowChecks, rewardScore, penaltyScore, slots,
    });
  }

  const skills = [...skillMap.values()]
    .map((s) => ({ ...s, avgModifier: s.count ? s.avgModifier / s.count : 0 }))
    .sort((a, b) => b.count - a.count);
  const verbs = [...verbMap.values()].sort((a, b) =>
    (b.success.count + b.failure.count) - (a.success.count + a.failure.count));

  return { encounters: records.length, byKind, withoutCheck, checks, skills, verbs, rows };
}
