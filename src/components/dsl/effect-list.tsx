// Список DSL-эффектов как форма (verb-комбобокс + число + удалить/добавить).
// Используется в конструкторах вне React Flow (mystery-форма и др.).
import { Combobox } from '@/components/combobox';
import { NumField } from '@/components/num-field';

type Eff = Record<string, unknown>;

export function EffectList(
  { value, onChange, verbs, locations }: {
    value: Eff[]; onChange: (e: Eff[]) => void; verbs: string[];
    locations?: { id: string; name: string }[];
  },
): JSX.Element {
  const effs = value ?? [];
  const setRow = (i: number, patch: Eff): void =>
    onChange(effs.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const setNum = (i: number, n: number): void => {
    const key = 'amount' in effs[i] ? 'amount' : 'count';
    setRow(i, { [key]: n });
  };
  return (
    <div>
      {effs.map((e, i) => (
        <div key={i} className="flex gap-1.5 items-center mb-1.5">
          <Combobox
            className="flex-1"
            value={String(e['do'] ?? '')}
            options={verbs}
            onChange={(v) => setRow(i, { do: v })}
            placeholder="verb…"
          />
          <NumField value={Number(e['amount'] ?? e['count'] ?? 1)} onChange={(n) => setNum(i, n)} min={1} />
          {e['do'] === 'placeEldritchToken' && locations && (
            <select
              value={String(e['where'] ?? '')}
              onChange={(ev) => setRow(i, { where: ev.target.value })}
              title="Куда положить жетон Знамения"
            >
              <option value="">случайно</option>
              <option value="self">на карту Тайны</option>
              <option value="marked">на помеченные локации</option>
              <optgroup label="конкретная локация">
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>
            </select>
          )}
          <button type="button" onClick={() => onChange(effs.filter((_, j) => j !== i))} title="удалить">×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...effs, { do: verbs[0] ?? 'gainClue', count: 1 }])}>
        + эффект
      </button>
    </div>
  );
}
