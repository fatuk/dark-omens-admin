// Конструктор карты Мифов (форма): два списка эффектов — onReveal (→onDraw) и
// ongoing (→whileInPlay) — плюс секция «Слух» (Ongoing Rumor): таймер-жетоны,
// DSL Расплаты/истечения, способ решения. Цвет берётся из вида/тега карточки.
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { EffectList } from '@/components/dsl/effect-list';

type Eff = Record<string, unknown>;
type Obj = Record<string, unknown>;

const SOLVE_KINDS: { value: string; label: string }[] = [
  { value: 'gateClose',       label: 'Закрыть врата-портал' },
  { value: 'encounter',       label: 'Встреча на клетке слуха' },
  { value: 'monsterDefeated', label: 'Победить заспауненного монстра' },
  { value: 'toughnessOnCard', label: 'Стойкость монстров на карте' },
];

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
  const listProps = {
    verbs, verbDefs: meta?.dsl?.verbs, targetGroups: meta?.dsl?.targetGroups,
    locations: meta?.locations, targets: meta?.dsl?.targets,
  };

  // ── Слух (блок data.rumor) ──
  const rumor = (d['rumor'] && typeof d['rumor'] === 'object' ? d['rumor'] as Obj : null);
  const solve = (rumor?.['solve'] as Obj) ?? {};
  const patchRumor = (next: Obj | null): void => {
    const nd: Obj = { ...d };
    if (next === null) delete nd['rumor']; else nd['rumor'] = next;
    patch(nd);
  };

  return (
    <div className="dsl-form">
      <div className="prose-group">
        <div className="prose-group-title">При раскрытии (onReveal → onDraw)</div>
        <EffectList value={(d['onReveal'] as Eff[]) ?? []} onChange={(e) => patch({ ...d, onReveal: e })} {...listProps} />
      </div>
      <div className="prose-group">
        <div className="prose-group-title">Расплата (onReckoning) — символ ☼, срабатывает, пока карта в игре</div>
        <EffectList value={(d['onReckoning'] as Eff[]) ?? []} onChange={(e) => patch({ ...d, onReckoning: e })} {...listProps} />
      </div>
      <div className="prose-group">
        <div className="prose-group-title">Пока в игре (ongoing → whileInPlay)</div>
        <EffectList value={(d['ongoing'] as Eff[]) ?? []} onChange={(e) => patch({ ...d, ongoing: e })} {...listProps} />
      </div>

      <div className="prose-group">
        <label className="dsl-check">
          <input
            type="checkbox"
            checked={!!rumor}
            onChange={(e) => patchRumor(e.target.checked ? { tokens: 4, solve: { kind: 'gateClose' } } : null)}
          />
          {' '}Слух (Ongoing Rumor)
        </label>
        {rumor && (
          <div className="dsl-subform">
            <label className="dsl-field">
              Жетоны-таймер:
              {' '}
              <input
                type="number" min={0} style={{ width: 64 }}
                value={Number(rumor['tokens'] ?? 0)}
                onChange={(e) => patchRumor({ ...rumor, tokens: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label className="dsl-field">
              Решение:
              {' '}
              <select
                value={String(solve['kind'] ?? 'gateClose')}
                onChange={(e) => patchRumor({ ...rumor, solve: { ...solve, kind: e.target.value } })}
              >
                {SOLVE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label className="dsl-check">
              <input
                type="checkbox"
                checked={!!rumor['solveOnExpire']}
                onChange={(e) => patchRumor({ ...rumor, solveOnExpire: e.target.checked })}
              />
              {' '}Развеять Слух, когда жетоны истекли (solveOnExpire)
            </label>
            <div className="prose-group-title">Расплата Слуха (onReckoning) — по умолчанию «снять 1 жетон с карты»</div>
            <EffectList value={(rumor['onReckoning'] as Eff[]) ?? []} onChange={(e) => patchRumor({ ...rumor, onReckoning: e })} {...listProps} />
            <div className="prose-group-title">Когда жетонов на карте 0 (onExpire)</div>
            <EffectList value={(rumor['onExpire'] as Eff[]) ?? []} onChange={(e) => patchRumor({ ...rumor, onExpire: e })} {...listProps} />
          </div>
        )}
      </div>
    </div>
  );
}
