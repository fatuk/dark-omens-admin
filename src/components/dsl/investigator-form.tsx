// Конструктор сыщика: характеристики, навыки, старт, спец-действие и пассив.
//
// Тексты (имя, профессия, цитата, подписи способностей) правятся в панели
// «Тексты» — здесь они живут ключами перевода.
//
// Две тонкости, ради которых форма и нужна:
//   • пассив понимает НЕ ВСЕ глаголы, а только check-mod'ы — остальные движок
//     молча игнорирует (см. _PASSIVE_MOD_VERBS в investigators.gd). Поэтому в
//     пассиве список глаголов урезан: лучше не дать выбрать, чем дать выбрать
//     то, что не сработает;
//   • спец-действие бывает ДВУХ видов — обычная DSL-программа (`do`) либо
//     встроенный вид (`kind`) для действий, которым нужен ввод игрока и которые
//     в данных не выражаются («потратить здоровье, восстановить рассудок»).
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { EffectList } from '@/components/dsl/effect-list';

type Obj = Record<string, unknown>;
type Eff = Record<string, unknown>;

const SKILLS = ['lore', 'influence', 'observation', 'strength', 'will'] as const;
const SKILL_RU: Record<string, string> = {
  lore: 'Знание', influence: 'Влияние', observation: 'Наблюдение',
  strength: 'Сила', will: 'Воля',
};

/** Роли — ключи перевода, набор закрытый (см. data/investigators.json). */
const ROLES = [
  'INV_ROLE_ALL_ROUNDER', 'INV_ROLE_COMBAT', 'INV_ROLE_RESEARCH',
  'INV_ROLE_SUPPORT', 'INV_ROLE_MAGIC', 'INV_ROLE_GATE_CLOSER', 'INV_ROLE_EXPEDITION',
];
const ROLE_RU: Record<string, string> = {
  INV_ROLE_ALL_ROUNDER: 'Универсал', INV_ROLE_COMBAT: 'Боец', INV_ROLE_RESEARCH: 'Исследователь',
  INV_ROLE_SUPPORT: 'Поддержка', INV_ROLE_MAGIC: 'Маг', INV_ROLE_GATE_CLOSER: 'Закрывающий врата',
  INV_ROLE_EXPEDITION: 'Экспедиция',
};

/** Встроенные виды спец-действия. "" — обычная DSL-программа. */
const ABILITY_KINDS = [
  { value: '', label: 'Программа DSL (do)' },
  { value: 'convertVitality', label: 'Обмен здоровья и рассудка (ввод игрока)' },
];

/** Глаголы, которые пассив реально умеет применить к проверке. */
const PASSIVE_VERBS = [
  'rollAdditionalDice', 'addToDie', 'convertDie', 'improveSkill', 'impairSkill',
  'rerollDice', 'rerollMatching', 'enhanceReroll', 'minDice', 'substituteSkill',
];

/** Что можно положить сыщику в стартовый набор. */
const ITEM_KINDS = [
  { value: 'asset', label: 'Актив' },
  { value: 'spell', label: 'Заклинание' },
  { value: 'clue', label: 'Улики' },
  { value: 'resource', label: 'Ресурс' },
];

export function InvestigatorForm(
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

  const skills = (d['skills'] && typeof d['skills'] === 'object' ? d['skills'] as Obj : {});
  const roles = Array.isArray(d['role']) ? (d['role'] as string[]) : [];
  const items = Array.isArray(d['startingItems']) ? (d['startingItems'] as Obj[]) : [];
  const tickets = (d['startingTickets'] && typeof d['startingTickets'] === 'object'
    ? d['startingTickets'] as Obj : {});
  const ability = (d['ability'] && typeof d['ability'] === 'object' ? d['ability'] as Obj : null);
  const passive = (d['passive'] && typeof d['passive'] === 'object' ? d['passive'] as Obj : null);

  const listProps = {
    verbDefs: meta?.dsl?.verbs,
    targetGroups: meta?.dsl?.targetGroups,
    locations: meta?.locations,
    targets: meta?.dsl?.targets,
    refOptions: { condition: meta?.dsl?.conditions ?? [], skill: meta?.dsl?.skills ?? [] },
  };

  const patchItem = (i: number, it: Obj | null): void => {
    const list = items.slice();
    if (it) list[i] = it; else list.splice(i, 1);
    const next = { ...d };
    if (list.length) next['startingItems'] = list; else delete next['startingItems'];
    patch(next);
  };

  return (
    <div className="dsl-form">
      <div className="prose-group">
        <div className="row">
          <div>
            <label>Имя (внутренний ключ)</label>
            {/* По нему сыщик адресуется во всей игре — правка ломает ссылки. */}
            <input
              value={String(d['name'] ?? '')}
              onChange={(e) => patch({ ...d, name: e.target.value })}
            />
          </div>
          <div>
            <label>Здоровье</label>
            <input
              type="number" min={1} max={12}
              value={Number(d['health'] ?? 5)}
              onChange={(e) => patch({ ...d, health: Number(e.target.value) })}
            />
          </div>
          <div>
            <label>Рассудок</label>
            <input
              type="number" min={1} max={12}
              value={Number(d['sanity'] ?? 5)}
              onChange={(e) => patch({ ...d, sanity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label>Стартовая локация</label>
            <select
              value={String(d['startingLocation'] ?? '')}
              onChange={(e) => patch({ ...d, startingLocation: e.target.value })}
            >
              <option value="">— не задана —</option>
              {(meta?.locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
              {/* Старые записи адресуют локацию именем, а не id — не теряем. */}
              {String(d['startingLocation'] ?? '') !== ''
                && !(meta?.locations ?? []).some((l) => l.id === d['startingLocation']) && (
                <option value={String(d['startingLocation'])}>{String(d['startingLocation'])} (?)</option>
              )}
            </select>
          </div>
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Навыки</div>
        {/* Пять навыков обязаны стоять одной строкой: это одна характеристика,
            разбитая на пять чисел, и перенос ломает чтение. Общий .row даёт
            каждому полю basis 160px и max 280px — впятером они переносятся,
            поэтому здесь доли равные и без максимума. */}
        <div className="row">
          {SKILLS.map((s) => (
            <div key={s} style={{ flex: '1 1 0', minWidth: 0, maxWidth: 'none' }}>
              <label>{SKILL_RU[s]}</label>
              <input
                type="number" min={1} max={6}
                value={Number(skills[s] ?? 1)}
                onChange={(e) => patch({ ...d, skills: { ...skills, [s]: Number(e.target.value) } })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Роли — для подсказки при выборе</div>
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {ROLES.map((r) => (
            <button
              key={r}
              className={roles.includes(r) ? 'primary' : ''}
              title={r}
              onClick={() => {
                const next = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
                const nd = { ...d };
                if (next.length) nd['role'] = next; else delete nd['role'];
                patch(nd);
              }}
            >
              {ROLE_RU[r] ?? r}
            </button>
          ))}
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Стартовый набор</div>
        {items.length === 0 && <div className="rf-note">Пусто — сыщик начинает без вещей.</div>}
        {items.map((it, i) => {
          const kind = ITEM_KINDS.find((k) => it[k.value] !== undefined)?.value ?? 'asset';
          const val = it[kind];
          const isCount = kind === 'clue' || kind === 'resource';
          return (
            <div key={i} className="row">
              <div>
                <label>Что</label>
                <select
                  value={kind}
                  onChange={(e) => patchItem(i, { [e.target.value]: e.target.value === 'clue' || e.target.value === 'resource' ? 1 : '' })}
                >
                  {ITEM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div>
                <label>{isCount ? 'Сколько' : kind === 'spell' ? 'Заклинание' : 'Актив'}</label>
                {isCount ? (
                  <input
                    type="number" min={1} max={9}
                    value={Number(val ?? 1)}
                    onChange={(e) => patchItem(i, { [kind]: Number(e.target.value) })}
                  />
                ) : (
                  // Список приходит из меты (каталоги CMS). Руками id больше не
                  // вводим: опечатка означала бы сыщика со стартовым предметом,
                  // которого нет, и молча — движок такую ссылку не проверяет.
                  <select
                    value={String(val ?? '')}
                    onChange={(e) => patchItem(i, { [kind]: e.target.value })}
                  >
                    <option value="">— выбрать —</option>
                    {((kind === 'spell' ? meta?.spells : meta?.assets) ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                    {String(val ?? '') !== ''
                      && !((kind === 'spell' ? meta?.spells : meta?.assets) ?? []).some((o) => o.id === val) && (
                      <option value={String(val)}>{String(val)} — нет в каталоге</option>
                    )}
                  </select>
                )}
              </div>
              <button className="danger" onClick={() => patchItem(i, null)}>×</button>
            </div>
          );
        })}
        <button onClick={() => patchItem(items.length, { asset: '' })}>+ предмет</button>

        {/* Билеты — ОТДЕЛЬНОЕ поле startingTickets: {train, ship}, а не элемент
            списка. Положить их в startingItems значило бы записать то, что игра
            не читает (см. _starting_ticket_count в game_state.gd). */}
        <div className="row" style={{ marginTop: 10 }}>
          {(['train', 'ship'] as const).map((kind) => (
            <div key={kind} style={{ flex: '1 1 0', minWidth: 0, maxWidth: 'none' }}>
              <label>{kind === 'train' ? 'Билеты на поезд' : 'Билеты на корабль'}</label>
              <input
                type="number" min={0} max={4}
                value={Number(tickets[kind] ?? 0)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const t: Obj = { ...tickets };
                  if (n > 0) t[kind] = n; else delete t[kind];
                  const nd = { ...d };
                  if (Object.keys(t).length) nd['startingTickets'] = t;
                  else delete nd['startingTickets'];
                  patch(nd);
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Спец-действие — тратит действие, раз в раунд</div>
        <div className="row">
          <div>
            <label>Есть ли</label>
            <select
              value={ability ? 'yes' : 'no'}
              onChange={(e) => {
                const next = { ...d };
                if (e.target.value === 'no') delete next['ability'];
                else next['ability'] = { name: '', text: '', do: [] };
                patch(next);
              }}
            >
              <option value="no">— нет —</option>
              <option value="yes">Есть</option>
            </select>
          </div>
          {ability && (
            <div>
              <label>Как работает</label>
              <select
                value={String(ability['kind'] ?? '')}
                onChange={(e) => {
                  const a: Obj = { ...ability };
                  if (e.target.value) { a['kind'] = e.target.value; delete a['do']; }
                  else { delete a['kind']; a['do'] = Array.isArray(a['do']) ? a['do'] : []; }
                  patch({ ...d, ability: a });
                }}
              >
                {ABILITY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
          )}
        </div>
        {ability && !ability['kind'] && (
          <EffectList
            {...listProps}
            verbs={[...(meta?.dsl?.actionVerbs ?? [])].sort()}
            value={Array.isArray(ability['do']) ? (ability['do'] as Eff[]) : []}
            onChange={(l) => patch({ ...d, ability: { ...ability, do: l } })}
          />
        )}
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Пассив — постоянный модификатор проверок</div>
        <div className="row">
          <div>
            <label>Есть ли</label>
            <select
              value={passive ? 'yes' : 'no'}
              onChange={(e) => {
                const next = { ...d };
                if (e.target.value === 'no') delete next['passive'];
                else next['passive'] = { name: '', text: '', mods: [] };
                patch(next);
              }}
            >
              <option value="no">— нет —</option>
              <option value="yes">Есть</option>
            </select>
          </div>
        </div>
        {passive && (
          <>
            <EffectList
              {...listProps}
              verbs={PASSIVE_VERBS}
              value={Array.isArray(passive['mods']) ? (passive['mods'] as Eff[]) : []}
              onChange={(l) => {
                const p: Obj = { ...passive };
                if (l.length) p['mods'] = l; else delete p['mods'];
                patch({ ...d, passive: p });
              }}
            />
            {Array.isArray(passive['triggers']) && (passive['triggers'] as unknown[]).length > 0 && (
              <div className="rf-note">
                У пассива есть триггеры на события ({(passive['triggers'] as Obj[])
                  .map((t) => String(t['on'] ?? '?')).join(', ')}) — правятся во вкладке «JSON».
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
