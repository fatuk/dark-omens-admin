// Конструктор актива: стоимость, трейты и три слота эффектов — ровно те, что
// читает движок (AssetCatalog):
//   whileOwned — пассив, применяется сам, пока карта на руках;
//   action     — активируемая способность (слот действия под проверку);
//   triggered  — реакция на событие (on: defeatMonster и т.п.).
//
// Слоты разведены намеренно: у карты может быть и пассив, и действие
// одновременно («Охотник на монстров»), и путать их нельзя — от слота зависит,
// предложит ли игра карту в бою.
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { EffectList } from '@/components/dsl/effect-list';

type Obj = Record<string, unknown>;
type Eff = Record<string, unknown>;

/** Трейты — как в relay (encounter-prompt: TAGS). */
const TRAITS = ['weapon', 'trinket', 'item', 'magical', 'relic', 'ally', 'service', 'teamwork'];

/** Событие для слота triggered. Список движковый — см. AssetCatalog. */
const TRIGGERS = [
  { value: '', label: '— выбрать событие —' },
  { value: 'combatEncounter', label: 'Боевая встреча' },
  { value: 'defeatMonster', label: 'Победа над монстром' },
  { value: 'gainCondition', label: 'Получено состояние' },
  { value: 'rest', label: 'Отдых' },
];

export function AssetForm(
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
  const effect = (d['effect'] && typeof d['effect'] === 'object' ? d['effect'] as Obj : {});
  const patchEffect = (key: string, list: Eff[]): void => {
    const next: Obj = { ...effect };
    if (list.length) next[key] = list;
    else delete next[key];
    patch({ ...d, effect: next });
  };

  const traits = Array.isArray(d['traits']) ? (d['traits'] as string[]) : [];
  const toggleTrait = (t: string): void => {
    const has = traits.includes(t);
    patch({ ...d, traits: has ? traits.filter((x) => x !== t) : [...traits, t] });
  };

  const listProps = {
    verbs: [...(meta?.dsl?.actionVerbs ?? [])].sort(),
    verbDefs: meta?.dsl?.verbs,
    targetGroups: meta?.dsl?.targetGroups,
    locations: meta?.locations,
    targets: meta?.dsl?.targets,
    refOptions: {
      condition: meta?.dsl?.conditions ?? [],
      skill: meta?.dsl?.skills ?? [],
    },
  };

  const asList = (key: string): Eff[] => {
    const v = effect[key];
    return Array.isArray(v) ? (v as Eff[]) : [];
  };

  // triggered хранится массивом объектов { on, do: [...] } — редактируем первый:
  // карт с двумя разными реакциями в корпусе нет, а списком списков форма стала
  // бы нечитаемой. Если такая карта появится — она видна во вкладке «JSON».
  const triggered = asList('triggered');
  const trig = (triggered[0] ?? {}) as Obj;
  const patchTrig = (next: Obj | null): void => {
    const rest = triggered.slice(1);
    patchEffect('triggered', next ? [next, ...rest] : rest);
  };

  return (
    <div className="dsl-form">
      <div className="prose-group">
        <div className="row">
        <div>
          <label>Стоимость</label>
          <input
            type="number" min={0} max={9}
            value={Number(d['cost'] ?? 0)}
            onChange={(e) => patch({ ...d, cost: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>Навык (для действия)</label>
          <select
            value={String(d['skill'] ?? '')}
            onChange={(e) => {
              const next = { ...d };
              if (e.target.value) next['skill'] = e.target.value; else delete next['skill'];
              patch(next);
            }}
          >
            <option value="">— нет —</option>
            {(meta?.dsl?.skills ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Трейты</div>
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {TRAITS.map((t) => (
            <button
              key={t}
              className={traits.includes(t) ? 'primary' : ''}
              onClick={() => toggleTrait(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Пассив — пока карта на руках (whileOwned)</div>
        <EffectList
          {...listProps}
          value={asList('whileOwned')}
          onChange={(l) => patchEffect('whileOwned', l)}
        />
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Действие — активируется игроком (action)</div>
        <EffectList
          {...listProps}
          value={asList('action')}
          onChange={(l) => patchEffect('action', l)}
        />
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Реакция на событие (triggered)</div>
        <div className="row">
          <div>
            <label>Событие</label>
            <select
              value={String(trig['on'] ?? '')}
              onChange={(e) => {
                if (!e.target.value) return patchTrig(null);
                patchTrig({ ...trig, on: e.target.value });
              }}
            >
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {trig['on'] ? (
          <EffectList
            {...listProps}
            value={Array.isArray(trig['do']) ? (trig['do'] as Eff[]) : []}
            onChange={(l) => patchTrig({ ...trig, do: l })}
          />
        ) : null}
      </div>
    </div>
  );
}
