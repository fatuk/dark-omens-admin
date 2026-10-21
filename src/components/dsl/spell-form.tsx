// Конструктор заклинания: лицо карты (front) и её обороты (backs).
//
// Устройство не такое, как у актива. У заклинания две стороны: ЛИЦО — что оно
// делает при касте, и ОБОРОТ — чем это обходится. Оборот тянется случайно при
// каждом касте (SpellCatalog.random_back), поэтому их несколько, и у каждого
// ярусы по числу успехов: `on` вида "0", "1+", "0-1", "2+".
//
// Тексты (название, описание способности, тексты оборотов) правятся в панели
// «Тексты» — здесь они живут ключами перевода.
import { useMemo } from 'react';
import type { Meta } from '@/lib/api';
import { refOptionsFrom } from '@/lib/dsl-refs';
import { EffectList } from '@/components/dsl/effect-list';

type Obj = Record<string, unknown>;
type Eff = Record<string, unknown>;

const SUBTYPES = [
  { value: 'ritual', label: 'Ритуал' },
  { value: 'incantation', label: 'Заклятие' },
  { value: 'glamour', label: 'Чары (аура)' },
];

/** Когда заклинание разыгрывается. Список движковый (SpellFlow). */
const TRIGGERS = [
  { value: 'action', label: 'Действием' },
  { value: 'combatEncounter', label: 'В боевой встрече' },
  { value: 'exhaust', label: 'Истощением' },
  { value: 'onRest', label: 'На отдыхе' },
];

/** Слаг заклинания для ключей оборотов: id карточки, иначе из ключа названия
 *  (SPELL_FEED_THE_MIND_NAME → feed_the_mind). */
function spellSlug(d: Obj): string {
  const id = String(d['id'] ?? '');
  if (id) return id;
  const name = String(d['name'] ?? '');
  return name.replace(/^SPELL_/, '').replace(/_NAME$/, '').toLowerCase() || 'spell';
}

/** Следующий свободный номер оборота: по хвосту _B<n> у ключей текста и _b<n> у id. */
function nextBackNo(backs: Obj[]): number {
  let max = 0;
  for (const b of backs) {
    for (const v of [String(b['text'] ?? ''), String(b['id'] ?? '')]) {
      const m = /_b(\d+)$/i.exec(v);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return Math.max(max, backs.length) + 1;
}

/** Ключ текста оборота: RECK_<SLUG>_B<n> — по нему панель «Тексты» слева заводит поле. */
function backTextKey(d: Obj, n: number): string {
  return `RECK_${spellSlug(d).toUpperCase()}_B${n}`;
}

/** Ключ текста яруса: <ключ оборота>_T<n>. У каждого яруса в EH свой флейвор;
 *  его показывает окно расплаты, нет — текст оборота целиком. */
function tierTextKey(d: Obj, b: Obj, backNo: number, n: number): string {
  return `${String(b['text'] ?? '') || backTextKey(d, backNo)}_T${n}`;
}

export function SpellForm(
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
  const front = (d['front'] && typeof d['front'] === 'object' ? d['front'] as Obj : {});
  const patchFront = (field: string, v: unknown): void => {
    const next: Obj = { ...front };
    if (v === '' || v === null) delete next[field]; else next[field] = v;
    patch({ ...d, front: next });
  };

  const listProps = {
    verbs: [...(meta?.dsl?.actionVerbs ?? [])].sort(),
    verbDefs: meta?.dsl?.verbs,
    targetGroups: meta?.dsl?.targetGroups,
    locations: meta?.locations,
    targets: meta?.dsl?.targets,
    refOptions: refOptionsFrom(meta, skills),
  };

  const backs = Array.isArray(d['backs']) ? (d['backs'] as Obj[]) : [];
  const patchBacks = (list: Obj[]): void => {
    const next = { ...d };
    if (list.length) next['backs'] = list; else delete next['backs'];
    patch(next);
  };
  const patchBack = (i: number, b: Obj | null): void => {
    const list = backs.slice();
    if (b) list[i] = b; else list.splice(i, 1);
    patchBacks(list);
  };

  // Чары (glamour) работают аурой, а не броском: у них вместо onPass — aura.
  const isGlamour = String(d['subtype'] ?? '') === 'glamour';

  return (
    <div className="dsl-form">
      <div className="prose-group">
        <div className="row">
          <div>
            <label>Вид</label>
            <select
              value={String(d['subtype'] ?? 'ritual')}
              onChange={(e) => patch({ ...d, subtype: e.target.value })}
            >
              {SUBTYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Лицо — что делает при касте</div>
        <div className="row">
          <div>
            <label>Разыгрывается</label>
            <select
              value={String(front['trigger'] ?? 'action')}
              onChange={(e) => patchFront('trigger', e.target.value)}
            >
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label>Проверка</label>
            <select
              value={String(front['test'] ?? '')}
              onChange={(e) => patchFront('test', e.target.value)}
            >
              <option value="">— без броска —</option>
              {skills.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>Модификатор</label>
            <input
              type="number" min={-5} max={5}
              value={Number(front['modifier'] ?? 0)}
              onChange={(e) => patchFront('modifier', Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div className="prose-group-title">
            {isGlamour ? 'Аура — действует, пока карта в игре' : 'При успехе (onPass)'}
          </div>
          <EffectList
            {...listProps}
            value={(Array.isArray(front[isGlamour ? 'aura' : 'onPass'])
              ? front[isGlamour ? 'aura' : 'onPass'] as Eff[] : [])}
            onChange={(l) => patchFront(isGlamour ? 'aura' : 'onPass', l.length ? l : null)}
          />
        </div>
      </div>

      <div className="prose-group">
        <div className="prose-group-title">
          Обороты — цена каста. Тянется случайный, ярус выбирается по числу успехов
        </div>
        {backs.length === 0 && <div className="rf-note">Оборотов нет — каст без последствий.</div>}
        {backs.map((b, i) => {
          const tiers = Array.isArray(b['tiers']) ? (b['tiers'] as Obj[]) : [];
          const patchTier = (ti: number, t: Obj | null): void => {
            const list = tiers.slice();
            if (t) list[ti] = t; else list.splice(ti, 1);
            patchBack(i, { ...b, tiers: list });
          };
          return (
            // Ключ — позиция, а не id: при вводе id блок иначе пересоздавался
            // на каждую букву и инпут терял фокус.
            <div key={i} className="spell-back">
              <div className="spell-back-head">
                <span className="spell-back-title">Оборот {i + 1}</span>
                {String(b['text'] ?? '') && (
                  <span className="spell-back-key">текст: {String(b['text'])}</span>
                )}
              </div>
              <div className="row">
                <div>
                  <label>Идентификатор оборота</label>
                  <input
                    value={String(b['id'] ?? '')}
                    onChange={(e) => patchBack(i, { ...b, id: e.target.value })}
                  />
                </div>
                <button className="danger" onClick={() => patchBack(i, null)}>Удалить оборот</button>
              </div>
              {/* Оборот без ключа текста (заведён раньше) — поля слева у него нет. Если
                  тексты есть у ярусов, общий текст оборота не нужен. */}
              {!String(b['text'] ?? '') && !tiers.some((t) => String(t['text'] ?? '')) && (
                <button onClick={() => patchBack(i, { ...b, text: backTextKey(d, nextBackNo(backs)) })}>
                  + текст оборота
                </button>
              )}
              {tiers.map((t, ti) => (
                <div key={ti} className="spell-tier">
                  <div className="spell-tier-title">
                    Ярус {ti + 1}{String(t['on'] ?? '') ? ` · успехов: ${String(t['on'])}` : ''}
                    {String(t['text'] ?? '') && (
                      <span className="spell-back-key"> · текст: {String(t['text'])}</span>
                    )}
                  </div>
                  <div className="row">
                    <div>
                      <label>Успехов</label>
                      {/* Формат движковый: "0", "1+", "0-1", "2+". */}
                      <input
                        value={String(t['on'] ?? '')}
                        placeholder="0 / 1+ / 0-1"
                        onChange={(e) => patchTier(ti, { ...t, on: e.target.value })}
                      />
                    </div>
                    {!String(t['text'] ?? '') && (
                      <button onClick={() => patchTier(ti, { ...t, text: tierTextKey(d, b, i + 1, ti + 1) })}>
                        + текст яруса
                      </button>
                    )}
                    <button onClick={() => patchTier(ti, null)}>Удалить ярус</button>
                  </div>
                  <EffectList
                    {...listProps}
                    value={Array.isArray(t['effect']) ? (t['effect'] as Eff[]) : []}
                    onChange={(l) => patchTier(ti, { ...t, effect: l })}
                  />
                </div>
              ))}
              <button
                onClick={() => {
                  const t: Obj = { on: '', effect: [] };
                  if (String(b['text'] ?? '') || tiers.some((x) => String(x['text'] ?? ''))) {
                    t['text'] = tierTextKey(d, b, i + 1, tiers.length + 1);
                  }
                  patchBack(i, { ...b, tiers: [...tiers, t] });
                }}
              >
                + ярус
              </button>
            </div>
          );
        })}
        {/* Новый оборот сразу с id и ключом текста — поле для текста появится слева. */}
        <button
          onClick={() => {
            const n = nextBackNo(backs);
            patchBacks([...backs, { id: `${spellSlug(d)}_b${n}`, text: backTextKey(d, n), tiers: [] }]);
          }}
        >
          + оборот
        </button>
      </div>
    </div>
  );
}
