// Конструктор карты Мифов (форма): два списка эффектов — onReveal (→onDraw) и
// ongoing (→whileInPlay). Цвет берётся из вида/тега карточки.
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { EffectList } from '@/components/dsl/effect-list';

type Eff = Record<string, unknown>;
type Obj = Record<string, unknown>;

export function MythosForm(
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
  const verbs = [...(meta?.dsl?.actionVerbs ?? [])].sort();
  const patch = (next: Obj): void => onChange(JSON.stringify(next, null, 2));

  return (
    <div className="dsl-form">
      <div className="prose-group">
        <div className="prose-group-title">При раскрытии (onReveal → onDraw)</div>
        <EffectList value={(d['onReveal'] as Eff[]) ?? []} onChange={(e) => patch({ ...d, onReveal: e })} verbs={verbs} verbDefs={meta?.dsl?.verbs} targetGroups={meta?.dsl?.targetGroups} locations={meta?.locations} targets={meta?.dsl?.targets} />
      </div>
      <div className="prose-group">
        <div className="prose-group-title">Расплата (onReckoning) — символ ☼, срабатывает, пока карта в игре</div>
        <EffectList value={(d['onReckoning'] as Eff[]) ?? []} onChange={(e) => patch({ ...d, onReckoning: e })} verbs={verbs} verbDefs={meta?.dsl?.verbs} targetGroups={meta?.dsl?.targetGroups} locations={meta?.locations} targets={meta?.dsl?.targets} />
      </div>
      <div className="prose-group">
        <div className="prose-group-title">Пока в игре (ongoing → whileInPlay)</div>
        <EffectList value={(d['ongoing'] as Eff[]) ?? []} onChange={(e) => patch({ ...d, ongoing: e })} verbs={verbs} verbDefs={meta?.dsl?.verbs} targetGroups={meta?.dsl?.targetGroups} locations={meta?.locations} targets={meta?.dsl?.targets} />
      </div>
    </div>
  );
}
