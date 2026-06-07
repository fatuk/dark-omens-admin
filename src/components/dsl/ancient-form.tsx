// Конструктор Древнего (форма-рецепт): doomClock + локации Тайн по актам +
// колода Мифов по актам (карт каждого цвета). Не эффекты — структура/числа.
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { NumField } from '@/components/num-field';

type Obj = Record<string, unknown>;
const ACTS = ['1', '2', '3'];
const COLORS = ['green', 'yellow', 'blue'];

export function AncientForm(
  { value, onChange }: { value: string; onChange: (json: string) => void; meta?: Meta },
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

  const ml = (d['mysteryLocations'] ?? {}) as Obj;
  const mlByAct = (ml['byAct'] ?? {}) as Obj;
  const setMl = (act: string, locs: string[]): void =>
    patch({ ...d, mysteryLocations: { ...ml, byAct: { ...mlByAct, [act]: locs } } });

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
        <div className="prose-group-title">Локации Тайн по актам (id через запятую)</div>
        {ACTS.map((a) => {
          const locs = Array.isArray(mlByAct[a]) ? (mlByAct[a] as unknown[]).map(String) : [];
          return (
            <div key={a} className="field">
              <label>Акт {a}</label>
              <input
                className="w-full"
                value={locs.join(', ')}
                onChange={(e) => setMl(a, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                placeholder="Arkham, 8, …"
              />
            </div>
          );
        })}
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
