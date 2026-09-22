// Конструктор артефакта. Механически это актив без цены: артефакты не покупают
// в магазине, их выдают встречи и Иные миры («Получите 1 Артефакт»), поэтому
// поля «Стоимость» здесь нет — оно бы означало витрину, которой у них не бывает.
//
// Слоты те же, что у актива (AssetCatalog читает их одинаково):
//   whileOwned — пассив, пока карта на руках («Сыщики в вашей локации бросают
//                1 дополнительный кубик…»);
//   onGain     — при получении карты («Взяв эту карту из колоды, получите 5 улик»);
//   action     — активируемая способность («Действие: пройдите проверку Знания…»);
//   triggered  — реакция на событие.
//
// onGain у артефактов встречается заметно чаще, чем у активов, поэтому слот
// вынесен в форму, а не оставлен на вкладку JSON.
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { refOptionsFrom } from '@/lib/dsl-refs';
import { EffectList } from '@/components/dsl/effect-list';

type Obj = Record<string, unknown>;
type Eff = Record<string, unknown>;

/**
 * Трейты артефактов. Список движковый (ASSET_TRAITS в relay) — артефакты ходят
 * по тем же трейтам, что активы, иначе «сбросьте 1 Книгу» не смогло бы задеть
 * и то и другое. Подписи — как на картах.
 */
const TRAITS: { id: string; ru: string }[] = [
  { id: 'item',     ru: 'Вещь' },
  { id: 'magical',  ru: 'Волшебная' },
  { id: 'tome',     ru: 'Книга' },
  { id: 'weapon',   ru: 'Оружие' },
  { id: 'teamwork', ru: 'Командная' },
  { id: 'relic',    ru: 'Реликвия' },
  { id: 'trinket',  ru: 'Безделушка' },
  { id: 'elixir',   ru: 'Эликсир' },
];

/** Событие для слота triggered. Список движковый — см. AssetCatalog. */
const TRIGGERS = [
  { value: '', label: '— выбрать событие —' },
  { value: 'combatEncounter', label: 'Боевая встреча' },
  { value: 'defeatMonster', label: 'Победа над монстром' },
  { value: 'gainCondition', label: 'Получено состояние' },
  { value: 'rest', label: 'Отдых' },
];

export function ArtifactForm(
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
    refOptions: refOptionsFrom(meta),
  };

  const asList = (key: string): Eff[] => {
    const v = effect[key];
    return Array.isArray(v) ? (v as Eff[]) : [];
  };

  // triggered хранится массивом { on, do: [...] } — редактируем первый, как в
  // форме актива. Карта с двумя разными реакциями видна во вкладке «JSON».
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
          <div>
            <label>Уникальность</label>
            <select
              value={d['unique'] === false ? 'no' : 'yes'}
              onChange={(e) => patch({ ...d, unique: e.target.value === 'yes' })}
            >
              <option value="yes">уникальный (одна копия в игре)</option>
              <option value="no">обычный</option>
            </select>
          </div>
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Трейты</div>
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {TRAITS.map((t) => (
            <button
              key={t.id}
              className={traits.includes(t.id) ? 'primary' : ''}
              title={t.ru}
              onClick={() => toggleTrait(t.id)}
            >
              {t.id}
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
        <div className="prose-group-title">При получении карты (onGain)</div>
        <EffectList
          {...listProps}
          value={asList('onGain')}
          onChange={(l) => patchEffect('onGain', l)}
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
