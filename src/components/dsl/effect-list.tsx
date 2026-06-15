// Рекурсивный редактор DSL-эффектов: запись массива — лист-Action (verb + число +
// цель + verb-специфичные селекты) ЛИБО структурный узел choice/group/forEach с
// вложенными списками. Используется в конструкторах (mystery/mythos-формы).
import { Combobox } from '@/components/combobox';
import { NumField } from '@/components/num-field';

type Eff = Record<string, unknown>;

// Verb'ы, которые движок применяет без числа (count игнорируется) — прячем степпер,
// чтобы не вводить в заблуждение. monsterSurge масштабируется картой баланса сам.
const NO_COUNT = new Set([
  'closeGate', 'discardGate', 'monsterSurge', 'mysteryProgress', 'resolveReckoning',
]);

// forEach итерирует сыщиков — осмысленны только цели-семейства each.
const FOREACH_TARGETS = ['each', 'eachOnCity', 'eachOnWilderness', 'eachOnSea', 'eachOnSpace'];

type Props = {
  value: Eff[];
  onChange: (e: Eff[]) => void;
  verbs: string[];
  locations?: { id: string; name: string }[];
  targets?: string[];
};

const STRUCT = 'rounded border border-white/10 p-2 flex flex-col gap-1.5';
const HEAD = 'flex items-center gap-2 text-xs uppercase tracking-wide opacity-70';

export function EffectList({ value, onChange, verbs, locations, targets }: Props): JSX.Element {
  const effs = value ?? [];
  const newLeaf = (): Eff => ({ do: verbs[0] ?? 'gainClue', count: 1 });
  const setNode = (i: number, node: Eff): void => onChange(effs.map((e, j) => (j === i ? node : e)));
  const patch = (i: number, p: Eff): void => setNode(i, { ...effs[i], ...p });
  const remove = (i: number): void => onChange(effs.filter((_, j) => j !== i));
  const add = (node: Eff): void => onChange([...effs, node]);
  const setNum = (i: number, n: number): void => {
    const key = 'amount' in effs[i] ? 'amount' : 'count';
    patch(i, { [key]: n });
  };

  // Ветка choice как список эффектов: {group:[…]} разворачиваем для редактирования,
  // одиночный узел — [node]. Обратно: 1 эффект → сам узел, >1 → {group:[…]}.
  const branchToList = (b: Eff): Eff[] => (Array.isArray(b['group']) ? (b['group'] as Eff[]) : [b]);
  const listToBranch = (list: Eff[]): Eff => (list.length === 1 ? list[0] : { group: list });

  return (
    <div className="flex flex-col gap-1.5">
      {effs.map((e, i) => {
        // ── choice ────────────────────────────────────────────────────────────
        if ('choice' in e) {
          const branches = (e['choice'] as Eff[]) ?? [];
          const setBranches = (b: Eff[]): void => patch(i, { choice: b });
          return (
            <div key={i} className={STRUCT}>
              <div className={HEAD}>
                <span className="flex-1">Выбор (choice)</span>
                <button type="button" onClick={() => remove(i)} title="удалить">×</button>
              </div>
              {branches.map((b, k) => (
                <div key={k} className="rounded border border-white/5 p-1.5 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs opacity-60">
                    <span className="flex-1">ветка {k + 1}</span>
                    <button type="button" title="удалить ветку"
                      onClick={() => setBranches(branches.filter((_, x) => x !== k))}>×</button>
                  </div>
                  <EffectList
                    value={branchToList(b)}
                    onChange={(list) => setBranches(branches.map((x, y) => (y === k ? listToBranch(list) : x)))}
                    verbs={verbs} locations={locations} targets={targets}
                  />
                </div>
              ))}
              <button type="button" onClick={() => setBranches([...branches, newLeaf()])}>+ ветка</button>
            </div>
          );
        }
        // ── forEach ───────────────────────────────────────────────────────────
        if ('forEach' in e) {
          const sub = (e['do'] as Eff[]) ?? [];
          return (
            <div key={i} className={STRUCT}>
              <div className={HEAD}>
                <span className="flex-1">Для каждого (forEach)</span>
                <select value={String(e['forEach'] ?? 'each')}
                  onChange={(ev) => patch(i, { forEach: ev.target.value })} title="по кому проходим">
                  {FOREACH_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" onClick={() => remove(i)} title="удалить">×</button>
              </div>
              <EffectList value={sub} onChange={(list) => patch(i, { do: list })}
                verbs={verbs} locations={locations} targets={targets} />
            </div>
          );
        }
        // ── group ─────────────────────────────────────────────────────────────
        if ('group' in e) {
          const sub = (e['group'] as Eff[]) ?? [];
          return (
            <div key={i} className={STRUCT}>
              <div className={HEAD}>
                <span className="flex-1">Группа (group)</span>
                <button type="button" onClick={() => remove(i)} title="удалить">×</button>
              </div>
              <EffectList value={sub} onChange={(list) => patch(i, { group: list })}
                verbs={verbs} locations={locations} targets={targets} />
            </div>
          );
        }
        // ── лист-Action ───────────────────────────────────────────────────────
        const showCount = !NO_COUNT.has(String(e['do'])) && !(e['do'] === 'placeClue' && e['scale'] === 'balance');
        return (
          <div key={i} className="flex gap-1.5 items-center flex-wrap">
            <Combobox className="flex-1" value={String(e['do'] ?? '')} options={verbs}
              onChange={(v) => patch(i, { do: v })} placeholder="verb…" />
            {e['do'] === 'placeClue' && (
              <select value={String(e['scale'] ?? '')}
                onChange={(ev) => patch(i, { scale: ev.target.value || undefined })} title="Сколько улик класть">
                <option value="">точное число</option>
                <option value="balance">по карте баланса (игроки)</option>
              </select>
            )}
            {showCount && (
              <NumField value={Number(e['amount'] ?? e['count'] ?? 1)} onChange={(n) => setNum(i, n)} min={1} />
            )}
            {targets && (
              <select value={String(e['target'] ?? '')}
                onChange={(ev) => patch(i, { target: ev.target.value || undefined })} title="Цель эффекта">
                <option value="">сам / активный</option>
                {targets.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {e['do'] === 'placeEldritchToken' && locations && (
              <select value={String(e['where'] ?? '')}
                onChange={(ev) => patch(i, { where: ev.target.value })} title="Куда положить жетон Знамения">
                <option value="">случайно</option>
                <option value="self">на карту Тайны</option>
                <option value="marked">на помеченные локации</option>
                <optgroup label="конкретная локация">
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </optgroup>
              </select>
            )}
            <button type="button" onClick={() => remove(i)} title="удалить">×</button>
          </div>
        );
      })}
      <div className="flex gap-1.5 flex-wrap">
        <button type="button" onClick={() => add(newLeaf())}>+ эффект</button>
        <button type="button" onClick={() => add({ choice: [newLeaf(), newLeaf()] })}>+ выбор</button>
        <button type="button" onClick={() => add({ group: [newLeaf()] })}>+ группа</button>
        <button type="button" onClick={() => add({ forEach: 'each', do: [newLeaf()] })}>+ forEach</button>
      </div>
    </div>
  );
}
