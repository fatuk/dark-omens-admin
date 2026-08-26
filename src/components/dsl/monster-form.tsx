// Конструктор монстра: два боя (ужас и схватка), стойкость, ярус и Расплата.
//
// Ужас и схватка — РАЗНЫЕ проверки с разным уроном: ужас бьёт по рассудку,
// схватка по здоровью. Поэтому две одинаковые тройки полей, а не одна.
//
// Тексты (имя, описание способности) правятся в панели «Тексты» — здесь они
// живут ключами перевода и намеренно не редактируются.
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { EffectList } from '@/components/dsl/effect-list';

type Obj = Record<string, unknown>;
type Eff = Record<string, unknown>;

/** Когда срабатывает способность монстра. Список движковый (MonsterCatalog). */
const ABILITY_TRIGGERS = [
  { value: '', label: '— нет способности —' },
  { value: 'reckoning', label: 'В Расплату (☼)' },
  { value: 'onSpawn', label: 'При появлении' },
  { value: 'passive', label: 'Пассивно' },
  { value: 'special', label: 'Особая (описана текстом)' },
];

const RESISTS = [
  { value: '', label: '— нет —' },
  { value: 'physical', label: 'Физический урон' },
  { value: 'magical', label: 'Магический урон' },
];

export function MonsterForm(
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
  const skills = meta?.dsl?.skills ?? [];

  /** Флаги хранятся как true ЛИБО отсутствуют — false в данных не пишем. */
  const flag = (key: string): boolean => d[key] === true;
  const toggleFlag = (key: string): void => {
    const next = { ...d };
    if (flag(key)) delete next[key]; else next[key] = true;
    patch(next);
  };

  const block = (key: 'horror' | 'combat'): Obj =>
    (d[key] && typeof d[key] === 'object' ? d[key] as Obj : {});
  const patchBlock = (key: 'horror' | 'combat', field: string, v: unknown): void =>
    patch({ ...d, [key]: { ...block(key), [field]: v } });

  const ability = (d['ability'] && typeof d['ability'] === 'object' ? d['ability'] as Obj : {});
  const reck = Array.isArray(d['onReckoning']) ? (d['onReckoning'] as Eff[]) : [];

  const listProps = {
    verbs: [...(meta?.dsl?.actionVerbs ?? [])].sort(),
    verbDefs: meta?.dsl?.verbs,
    targetGroups: meta?.dsl?.targetGroups,
    locations: meta?.locations,
    targets: meta?.dsl?.targets,
    refOptions: { condition: meta?.dsl?.conditions ?? [], skill: skills },
  };

  const fight = (key: 'horror' | 'combat', title: string, hint: string) => (
    <div className="prose-group">
      <div className="prose-group-title">{title}</div>
      <div className="row">
        <div>
          <label>Проверка</label>
          <select
            value={String(block(key)['skill'] ?? '')}
            onChange={(e) => patchBlock(key, 'skill', e.target.value)}
          >
            <option value="">—</option>
            {skills.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label>Модификатор</label>
          <input
            type="number" min={-5} max={5}
            value={Number(block(key)['modifier'] ?? 0)}
            onChange={(e) => patchBlock(key, 'modifier', Number(e.target.value))}
          />
        </div>
        <div>
          <label>{hint}</label>
          <input
            type="number" min={0} max={9}
            value={Number(block(key)['damage'] ?? 0)}
            onChange={(e) => patchBlock(key, 'damage', Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="dsl-form">
      <div className="prose-group">
        <div className="row">
          <div>
            <label>Стойкость</label>
            <input
              type="number" min={0} max={9}
              value={Number(d['toughness'] ?? 0)}
              onChange={(e) => patch({ ...d, toughness: Number(e.target.value) })}
            />
          </div>
          <div>
            <label>Сопротивление</label>
            <select
              value={String(d['resist'] ?? '')}
              onChange={(e) => {
                const next = { ...d };
                if (e.target.value) next['resist'] = e.target.value; else delete next['resist'];
                patch(next);
              }}
            >
              {RESISTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="dsl-check">
            <input type="checkbox" checked={flag('epic')} onChange={() => toggleFlag('epic')} />
            {/* Эпик не попадает в чашу: его призывает конкретная карта Мифов. */}
            Эпический (спавнится поимённо, не из чаши)
          </label>
          <label className="dsl-check">
            <input
              type="checkbox"
              checked={d['toughnessPerInvestigator'] === 1}
              onChange={() => {
                const next = { ...d };
                if (next['toughnessPerInvestigator']) delete next['toughnessPerInvestigator'];
                else next['toughnessPerInvestigator'] = 1;
                patch(next);
              }}
            />
            Стойкость за каждого сыщика
          </label>
        </div>
      </div>

      {fight('horror', 'Ужас — проверка по рассудку', 'Урон рассудку')}
      {fight('combat', 'Схватка — проверка по здоровью', 'Урон здоровью')}

      <div className="prose-group">
        <div className="prose-group-title">Способность</div>
        <div className="row">
          <div>
            <label>Когда срабатывает</label>
            <select
              value={String(ability['trigger'] ?? '')}
              onChange={(e) => {
                const next = { ...d };
                if (!e.target.value) delete next['ability'];
                else next['ability'] = { ...ability, trigger: e.target.value };
                patch(next);
              }}
            >
              {ABILITY_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {ability['textKey'] ? (
          <div className="rf-note">Текст способности — в панели «Тексты» ({String(ability['textKey'])}).</div>
        ) : null}
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Расплата (onReckoning) — пока монстр на доске</div>
        <EffectList
          {...listProps}
          value={reck}
          onChange={(l) => {
            const next = { ...d };
            if (l.length) next['onReckoning'] = l; else delete next['onReckoning'];
            patch(next);
          }}
        />
      </div>
    </div>
  );
}
