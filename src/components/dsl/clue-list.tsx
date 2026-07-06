// Редактор улик Древнего: массив data.clues[]. Каждая улика самодостаточна —
// id (= имя файла картинки в игре: res://assets/cards/clue/<Id>.png, как арт
// ассета), домашняя локация + title/description по локалям. Картинку в админке НЕ
// грузим: игра ищет файл по id, нет файла → рамка без арта. Паттерн массива
// (map + add/remove/patch) — как в EffectList.
import { LOCALES } from '@/lib/types';

type LocText = Record<string, string>;
export type Clue = { id: string; location: string; title: LocText; description: LocText };

type Props = {
  value: Clue[];
  onChange: (c: Clue[]) => void;
  locations?: { id: string; name: string }[];
};

const STRUCT = 'rounded border border-white/10 p-2 flex flex-col gap-1.5';
const HEAD = 'flex items-center gap-2 text-xs uppercase tracking-wide opacity-70';

export function ClueList({ value, onChange, locations }: Props): JSX.Element {
  const clues = value ?? [];
  const setClue = (i: number, c: Clue): void => onChange(clues.map((x, j) => (j === i ? c : x)));
  const patch = (i: number, p: Partial<Clue>): void => setClue(i, { ...clues[i], ...p });
  const setText = (i: number, field: 'title' | 'description', loc: string, val: string): void => {
    const next = { ...clues[i][field], [loc]: val };
    patch(i, { [field]: next } as Partial<Clue>);
  };
  const remove = (i: number): void => onChange(clues.filter((_, j) => j !== i));
  const add = (): void => onChange([...clues, { id: '', location: '', title: {}, description: {} }]);
  const locs = locations ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      {clues.map((c, i) => (
        <div key={i} className={STRUCT}>
          <div className={HEAD}>
            <span className="flex-1">Улика {i + 1}</span>
            <button type="button" onClick={() => remove(i)} title="удалить">×</button>
          </div>
          <div className="flex gap-1.5 items-center flex-wrap">
            <input className="flex-1" value={c.id} placeholder="id (= имя файла картинки)"
              onChange={(ev) => patch(i, { id: ev.target.value })} />
            <select value={c.location} title="Домашняя локация улики"
              onChange={(ev) => patch(i, { location: ev.target.value })}>
              <option value="">— локация —</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {LOCALES.map((loc) => (
            <input key={'t-' + loc} className="w-full" value={c.title?.[loc] ?? ''}
              placeholder={`Заголовок (${loc})`}
              onChange={(ev) => setText(i, 'title', loc, ev.target.value)} />
          ))}
          {LOCALES.map((loc) => (
            <textarea key={'d-' + loc} className="w-full" rows={2} value={c.description?.[loc] ?? ''}
              placeholder={`Описание (${loc})`}
              onChange={(ev) => setText(i, 'description', loc, ev.target.value)} />
          ))}
        </div>
      ))}
      <button type="button" onClick={add}>+ улика</button>
    </div>
  );
}
