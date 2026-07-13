// Рекурсивный редактор DSL-эффектов: запись массива — лист-Action (verb + число +
// цель + verb-специфичные селекты) ЛИБО структурный узел choice/group/forEach/dieRoll/
// test с вложенными списками. Используется в конструкторах (mystery/mythos-формы).
//
// Поля листа выводятся из verb-МАНИФЕСТА (meta.dsl.verbs/targetGroups, источник —
// relay src/api/verb-manifest.ts): показывать ли счётчик, какие цели допустимы,
// какие enum-параметры. Никаких захардкоженных списков verb'ов — добавил verb в
// манифест → поле появилось здесь само.
import { Combobox } from '@/components/combobox';
import { NumField } from '@/components/num-field';
import type { VerbDef } from '@/lib/api';

type Eff = Record<string, unknown>;

// Фолбэки на случай, если relay ещё не отдаёт манифест (старый сервер).
const FOREACH_TARGETS = ['each', 'eachOnCity', 'eachOnWilderness', 'eachOnSea', 'eachOnSpace'];
const SKILLS = ['lore', 'influence', 'observation', 'strength', 'will'];
// Ресурсы стоимости (cost.spend) — зеркало relay effect-dsl.ts COST_RESOURCES.
const COST_RESOURCES = ['health', 'sanity', 'clue', 'asset', 'spell', 'focus'];

type Props = {
  value: Eff[];
  onChange: (e: Eff[]) => void;
  verbs: string[];
  verbDefs?: Record<string, VerbDef>;
  targetGroups?: Record<string, string[]>;
  locations?: { id: string; name: string }[];
  targets?: string[];
  // Разрешить редактировать cost (цена опции) на листах. Включается для веток
  // choice — «заплати улику/рассудок, чтобы выбрать эту опцию» (как в картах Мифов).
  allowCost?: boolean;
};

const STRUCT = 'rounded border border-white/10 p-2 flex flex-col gap-1.5';
const HEAD = 'flex items-center gap-2 text-xs uppercase tracking-wide opacity-70';

export function EffectList(
  { value, onChange, verbs, verbDefs, targetGroups, locations, targets, allowCost }: Props,
): JSX.Element {
  const effs = value ?? [];
  // Новый лист — только {do}. count/amount НЕ ставим по умолчанию: движок и так берёт 1,
  // а лишнее поле засоряет JSON (placeClue/monsterSurge вставляются чисто: {do:"…"}).
  // Числовое поле появится в форме (показывает 1) и запишется, только если автор его изменит.
  const newLeaf = (): Eff => ({ do: verbs[0] ?? 'gainClue' });
  const setNode = (i: number, node: Eff): void => onChange(effs.map((e, j) => (j === i ? node : e)));
  const patch = (i: number, p: Eff): void => setNode(i, { ...effs[i], ...p });
  const remove = (i: number): void => onChange(effs.filter((_, j) => j !== i));
  const add = (node: Eff): void => onChange([...effs, node]);

  // ── Метаданные verb'а из манифеста ──────────────────────────────────────────
  const defOf = (verb: string): VerbDef | undefined => verbDefs?.[verb];
  // Имя числового параметра (amount/count) или null, если verb без числа.
  const countParam = (verb: string): string | null => {
    const d = defOf(verb);
    if (!d) return 'count'; // нет манифеста → дефолтный счётчик
    const p = d.params.find((q) => q.name === 'amount' || q.name === 'count');
    return p ? p.name : null;
  };
  // enum-параметры (scale/scope/…) → дженерик-селект.
  const enumParams = (verb: string): { name: string; values: string[] }[] => {
    const d = defOf(verb);
    if (!d) return [];
    return d.params
      .filter((p) => p.type.t === 'enum' && Array.isArray(p.type.values))
      .map((p) => ({ name: p.name, values: p.type.values as string[] }));
  };
  // Список целей для дропдауна или null (target не нужен).
  const targetOptions = (verb: string): string[] | null => {
    const d = defOf(verb);
    if (!d) return targets ?? null; // нет манифеста → старое поведение (все targets)
    if (!d.targets) return null; // targets:null → без дропдауна
    return targetGroups?.[d.targets] ?? targets ?? [];
  };
  const foreachOpts = targetGroups?.['foreach'] ?? FOREACH_TARGETS;

  const setNum = (i: number, n: number): void => {
    const verb = String(effs[i]['do'] ?? '');
    const key = countParam(verb) ?? ('amount' in effs[i] ? 'amount' : 'count');
    patch(i, { [key]: n });
  };

  // Ветка choice как список эффектов: {group:[…]} разворачиваем для редактирования,
  // одиночный узел — [node]. Обратно: 1 эффект → сам узел, >1 → {group:[…]}.
  const branchToList = (b: Eff): Eff[] => (Array.isArray(b['group']) ? (b['group'] as Eff[]) : [b]);
  const listToBranch = (list: Eff[]): Eff => (list.length === 1 ? list[0] : { group: list });

  // Пробрасываем манифест во все вложенные списки. allowCost наследуется вглубь
  // (ветка choice включает его → cost доступен и во вложенных group/forEach).
  const sub = (v: Eff[], on: (e: Eff[]) => void, ac: boolean = !!allowCost): JSX.Element => (
    <EffectList value={v} onChange={on} verbs={verbs} verbDefs={verbDefs}
      targetGroups={targetGroups} locations={locations} targets={targets} allowCost={ac} />
  );

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
                  {sub(branchToList(b),
                    (list) => setBranches(branches.map((x, y) => (y === k ? listToBranch(list) : x))), true)}
                </div>
              ))}
              <button type="button" onClick={() => setBranches([...branches, newLeaf()])}>+ ветка</button>
            </div>
          );
        }
        // ── forEach ───────────────────────────────────────────────────────────
        if ('forEach' in e) {
          return (
            <div key={i} className={STRUCT}>
              <div className={HEAD}>
                <span className="flex-1">Для каждого (forEach)</span>
                <select value={String(e['forEach'] ?? 'each')}
                  onChange={(ev) => patch(i, { forEach: ev.target.value })} title="по кому проходим">
                  {foreachOpts.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" onClick={() => remove(i)} title="удалить">×</button>
              </div>
              {sub((e['do'] as Eff[]) ?? [], (list) => patch(i, { do: list }))}
            </div>
          );
        }
        // ── group ─────────────────────────────────────────────────────────────
        if ('group' in e) {
          return (
            <div key={i} className={STRUCT}>
              <div className={HEAD}>
                <span className="flex-1">Группа (group)</span>
                <button type="button" onClick={() => remove(i)} title="удалить">×</button>
              </div>
              {sub((e['group'] as Eff[]) ?? [], (list) => patch(i, { group: list }))}
            </div>
          );
        }
        // ── dieRoll ───────────────────────────────────────────────────────────
        if ('dieRoll' in e) {
          const rolls = (e['dieRoll'] as Eff[]) ?? [];
          const setRolls = (r: Eff[]): void => patch(i, { dieRoll: r });
          return (
            <div key={i} className={STRUCT}>
              <div className={HEAD}>
                <span className="flex-1">Бросок кубика (dieRoll)</span>
                <button type="button" onClick={() => remove(i)} title="удалить">×</button>
              </div>
              {rolls.map((r, k) => (
                <div key={k} className="rounded border border-white/5 p-1.5 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs opacity-60">
                    <span>грань</span>
                    <input className="w-16" value={String(r['on'] ?? '')} placeholder="1-2"
                      onChange={(ev) => setRolls(rolls.map((x, y) => (y === k ? { ...x, on: ev.target.value } : x)))} />
                    <span className="flex-1" />
                    <button type="button" title="удалить грань"
                      onClick={() => setRolls(rolls.filter((_, x) => x !== k))}>×</button>
                  </div>
                  {sub((r['then'] as Eff[]) ?? [],
                    (list) => setRolls(rolls.map((x, y) => (y === k ? { ...x, then: list } : x))))}
                </div>
              ))}
              <button type="button" onClick={() => setRolls([...rolls, { on: '6', then: [newLeaf()] }])}>+ грань</button>
            </div>
          );
        }
        // ── test (вложенная проверка) ───────────────────────────────────────────
        if ('test' in e) {
          return (
            <div key={i} className={STRUCT}>
              <div className={HEAD}>
                <span className="flex-1">Проверка (test)</span>
                <select value={String(e['test'] ?? 'will')}
                  onChange={(ev) => patch(i, { test: ev.target.value })} title="навык">
                  {SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" className="w-14" value={Number(e['modifier'] ?? 0)} title="модификатор"
                  onChange={(ev) => patch(i, { modifier: parseInt(ev.target.value, 10) || 0 })} />
                <button type="button" onClick={() => remove(i)} title="удалить">×</button>
              </div>
              <div className="text-xs opacity-60">Успех (onPass)</div>
              {sub((e['onPass'] as Eff[]) ?? [], (list) => patch(i, { onPass: list }))}
              <div className="text-xs opacity-60">Провал (onFail)</div>
              {sub((e['onFail'] as Eff[]) ?? [], (list) => patch(i, { onFail: list }))}
            </div>
          );
        }
        // ── лист-Action (поля из манифеста) ─────────────────────────────────────
        const verb = String(e['do'] ?? '');
        const cp = countParam(verb);
        const showCount = cp !== null && !(verb === 'placeClue' && e['scale'] === 'balance');
        const tOpts = targetOptions(verb);
        return (
          <div key={i} className="flex gap-1.5 items-center flex-wrap">
            <Combobox className="flex-1" value={verb} options={verbs}
              onChange={(v) => {
                // Смена verb'а: если у нового нет числового параметра (напр. monsterSurge) —
                // убираем застрявшие count/amount, чтобы узел остался чистым {do:"…"}.
                const next: Eff = { ...effs[i], do: v };
                if (countParam(v) === null) { delete next['count']; delete next['amount']; }
                setNode(i, next);
              }} placeholder="verb…" />
            {enumParams(verb).map((ep) => (
              <select key={ep.name} value={String(e[ep.name] ?? '')} title={ep.name}
                onChange={(ev) => patch(i, { [ep.name]: ev.target.value || undefined })}>
                <option value="">— {ep.name} —</option>
                {ep.values.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ))}
            {showCount && (
              <NumField value={Number(e['amount'] ?? e['count'] ?? 1)} onChange={(n) => setNum(i, n)} min={1} />
            )}
            {tOpts && (
              <select value={String(e['target'] ?? '')}
                onChange={(ev) => patch(i, { target: ev.target.value || undefined })} title="Цель эффекта">
                <option value="">сам / активный</option>
                {tOpts.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {allowCost && (() => {
              // Цена опции: потратить ресурс, чтобы выбрать эту ветку choice
              // ({cost:{spend,amount}}). spend='' → узел без цены (чистый {do}).
              const cost = e['cost'] as Eff | undefined;
              return (
                <>
                  <select value={String(cost?.['spend'] ?? '')} title="Цена: потратить ресурс за эту опцию"
                    onChange={(ev) => {
                      const spend = ev.target.value;
                      if (!spend) { const n = { ...effs[i] }; delete n['cost']; setNode(i, n); }
                      else patch(i, { cost: { spend, amount: Number(cost?.['amount'] ?? 1) } });
                    }}>
                    <option value="">— без цены —</option>
                    {COST_RESOURCES.map((r) => <option key={r} value={r}>−{r}</option>)}
                  </select>
                  {cost != null && (
                    <NumField value={Number(cost['amount'] ?? 1)}
                      onChange={(n) => patch(i, { cost: { ...cost, amount: n } })} min={1} />
                  )}
                </>
              );
            })()}
            {verb === 'placeEldritchToken' && locations && (
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
            {verb === 'openGate' && locations && (
              <select value={String(e['where'] ?? '')}
                onChange={(ev) => patch(i, { where: ev.target.value || undefined })} title="Где открыть Врата">
                <option value="">движок выберет гейт-спейс</option>
                <option value="self">в локации сыщика</option>
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
        <button type="button" onClick={() => add({ dieRoll: [{ on: '6', then: [newLeaf()] }] })}>+ бросок</button>
        <button type="button" onClick={() => add({ test: 'will', onPass: [], onFail: [newLeaf()] })}>+ проверка</button>
      </div>
    </div>
  );
}
