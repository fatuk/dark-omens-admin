// Конструктор Древнего (форма-рецепт): doomClock + Расплата Древнего (onReckoning) +
// колода Мифов по актам (карт каждого цвета). Эффекты Расплаты — DSL, остальное —
// структура/числа. Локации Тайн здесь НЕТ — их задаёт сама карта Тайны.
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { NumField } from '@/components/num-field';
import { EffectList } from '@/components/dsl/effect-list';
import { ClueList, type Clue } from '@/components/dsl/clue-list';

type Eff = Record<string, unknown>;
type Obj = Record<string, unknown>;
const ACTS = ['1', '2', '3'];
const COLORS = ['green', 'yellow', 'blue'];

export function AncientForm(
  { value, onChange, meta }: { value: string; onChange: (json: string) => void; meta?: Meta },
): JSX.Element {
  const parsed = useMemo<Obj | null>(() => {
    try {
      const o: unknown = JSON.parse(value);
      return o && typeof o === 'object' && !Array.isArray(o) ? (o as Obj) : null;
    } catch { return null; }
  }, [value]);

  if (!parsed) return <div className="rf-note">Невалидный JSON — правь во вкладке «JSON».</div>;

  const d = parsed;
  const patch = (next: Obj): void => onChange(JSON.stringify(next, null, 2));
  const verbs = [...(meta?.dsl?.actionVerbs ?? [])].sort();
  const listProps = {
    verbs, verbDefs: meta?.dsl?.verbs, targetGroups: meta?.dsl?.targetGroups,
    locations: meta?.locations, targets: meta?.dsl?.targets,
    refOptions: {
      condition: meta?.dsl?.conditions ?? [],
      skill: meta?.dsl?.skills ?? [],
    },
  };

  // NB: «Локации Тайн» у Древнего УБРАНЫ — их задаёт сама карта Тайны (поле «Локации»
  // в форме Тайны). Древний больше не определяет, где лежат жетоны/улики.

  const md = (d['mythosDeck'] ?? {}) as Obj;
  const mdByAct = (md['byAct'] ?? {}) as Obj;
  const setMd = (act: string, color: string, n: number): void => {
    const actObj = (mdByAct[act] ?? {}) as Obj;
    patch({ ...d, mythosDeck: { ...md, byAct: { ...mdByAct, [act]: { ...actObj, [color]: n } } } });
  };

  return (
    <div className="dsl-form">
      <div className="prose-group">
        <div className="prose-group-title">Часы Рока (doomClock)</div>
        <NumField value={Number(d['doomClock'] ?? 14)} onChange={(n) => patch({ ...d, doomClock: n })} min={1} />
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Расплата Древнего (onReckoning) — первый тир каждой Расплаты</div>
        <EffectList value={(d['onReckoning'] as Eff[]) ?? []} onChange={(e) => patch({ ...d, onReckoning: e })} {...listProps} />
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Улики по локациям (clues) — ключ = локация; картинка в игре по id локации (как арт ассета)</div>
        <ClueList value={(d['clues'] as Clue[]) ?? []} onChange={(clues) => patch({ ...d, clues })} locations={meta?.locations} />
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Колода Мифов по актам (карт каждого цвета)</div>
        <table className="ancient-deck">
          <thead>
            <tr><th>Акт</th>{COLORS.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {ACTS.map((a) => {
              const actObj = (mdByAct[a] ?? {}) as Obj;
              return (
                <tr key={a}>
                  <td>{a}</td>
                  {COLORS.map((c) => (
                    <td key={c}>
                      <NumField value={Number(actObj[c] ?? 0)} onChange={(n) => setMd(a, c, n)} min={0} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
