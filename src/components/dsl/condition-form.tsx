// Конструктор состояния: лицо карты (что делает, пока лежит у сыщика) и её
// обороты — исходы, которые открываются при перевороте (Расплата, отдых, встреча).
//
// Устройство (data/conditions.json игры, ConditionFlow):
//   kind / common / season / scenarioOnly — вид карты, «обычная» (Долг), сезон;
//   front / reckoning — ключи текстов лица и строки Расплаты;
//   action      — программа локального действия («проверьте Влияние — сбросьте»);
//   onReckoning — что делает в фазу Расплаты (чаще всего flipCard);
//   whileHeld   — постоянные ограничения (порог успеха, нельзя двигаться…);
//   triggered   — реакции на события ({on:"rest", do:[…]});
//   insteadOfEncounter / onDuplicate — "flip": перевернуть вместо встречи / при повторе;
//   backs       — обороты: свой id, ключи названия и текста, сезон, effect и then
//                 (что с картой после: discard — сбросить, front — назад лицом).
//
// Тексты правятся в панели «Тексты» — здесь они живут ключами перевода.
import { useMemo, useState, type ComponentProps } from 'react';
import type { Meta } from '@/lib/api';
import { refOptionsFrom } from '@/lib/dsl-refs';
import { EffectList } from '@/components/dsl/effect-list';
import { AutoTextarea } from '@/components/auto-textarea';

type Obj = Record<string, unknown>;
type Eff = Record<string, unknown>;
/** Справочники для EffectList (всё, кроме значения и обработчика). */
type ListProps = Omit<ComponentProps<typeof EffectList>, 'value' | 'onChange'>;

const KIND_LABELS: Record<string, string> = {
  madness: 'Безумие', injury: 'Травма', illness: 'Болезнь', bane: 'Проклятие',
  boon: 'Благо', deal: 'Сделка', restriction: 'Ограничение', exposure: 'Воздействие',
  pursuit: 'Преследование',
};

const THEN = [
  { value: 'discard', label: 'Сбросить карту' },
  { value: 'front', label: 'Вернуть лицом вверх' },
  { value: '', label: '— как задано движком —' },
];

const FLIP_OPTIONS = [
  { value: '', label: '— нет —' },
  { value: 'flip', label: 'Перевернуть' },
];

/** Слаг состояния для ключей: legInjury → LEG_INJURY. */
function upperSlug(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

/** Следующий свободный номер оборота по хвосту _b<n> у id. */
function nextBackNo(backs: Obj[]): number {
  let max = 0;
  for (const b of backs) {
    const m = /_b(\d+)$/i.exec(String(b['id'] ?? ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Math.max(max, backs.length) + 1;
}

/** Поле-список эффектов (массив) с подписью. Пустой список — поле удаляется. */
function EffField(
  { title, value, onChange, listProps }: {
    title: string; value: unknown; onChange: (l: Eff[] | null) => void;
    listProps: ListProps;
  },
): JSX.Element {
  return (
    <div style={{ marginTop: 8 }}>
      <div className="prose-group-title">{title}</div>
      <EffectList
        {...listProps}
        value={Array.isArray(value) ? (value as Eff[]) : []}
        onChange={(l) => onChange(l.length ? l : null)}
      />
    </div>
  );
}

/** Редкие поля сырым JSON: правится текстом, применяется, когда JSON валиден. */
function JsonField(
  { title, hint, value, onChange }: {
    title: string; hint: string; value: unknown; onChange: (v: unknown) => void;
  },
): JSX.Element {
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)));
  const [bad, setBad] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <div className="prose-group-title">{title}</div>
      <div className="rf-note">{hint}</div>
      <AutoTextarea
        className="mech-json"
        value={text}
        spellCheck={false}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (!t.trim()) { setBad(false); onChange(undefined); return; }
          try { onChange(JSON.parse(t)); setBad(false); } catch { setBad(true); }
        }}
      />
      {bad && <div className="rf-note">JSON с ошибкой — не применено.</div>}
    </div>
  );
}

export function ConditionForm(
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
  const set = (field: string, v: unknown): void => {
    const next: Obj = { ...d };
    if (v === '' || v === null || v === undefined || v === false) delete next[field];
    else next[field] = v;
    patch(next);
  };
  const skills = meta?.dsl?.skills ?? [];
  const kinds = meta?.dsl?.conditionKinds ?? Object.keys(KIND_LABELS);
  const seasons = meta?.seasons ?? [];
  const id = String(d['id'] ?? '');

  const listProps: ListProps = {
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

  const seasonSelect = (val: string, onPick: (v: string) => void): JSX.Element => (
    <select value={val} onChange={(e) => onPick(e.target.value)}>
      <option value="">— не размечено —</option>
      {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      {val && !seasons.some((s) => s.id === val) && <option value={val}>{val} (?)</option>}
    </select>
  );

  return (
    <div className="dsl-form">
      <div className="prose-group">
        <div className="row">
          <div>
            <label>Идентификатор</label>
            <input value={id} onChange={(e) => set('id', e.target.value)} placeholder="legInjury" />
          </div>
          <div>
            <label>Вид</label>
            <select value={String(d['kind'] ?? '')} onChange={(e) => set('kind', e.target.value)}>
              <option value="">—</option>
              {kinds.map((k) => <option key={k} value={k}>{KIND_LABELS[k] ?? k}</option>)}
            </select>
          </div>
          <div>
            <label>Сезон карты (игра)</label>
            {seasonSelect(String(d['season'] ?? ''), (v) => set('season', v))}
          </div>
        </div>
        <div className="row">
          <label className="dsl-check">
            <input
              type="checkbox" checked={Boolean(d['common'])}
              onChange={(e) => set('common', e.target.checked)}
            />
            Обычное (как Долг — не «тайное»)
          </label>
          <label className="dsl-check">
            <input
              type="checkbox" checked={Boolean(d['scenarioOnly'])}
              onChange={(e) => set('scenarioOnly', e.target.checked)}
            />
            Только для сценария (в общие колоды не идёт)
          </label>
        </div>
        <div className="row">
          <div>
            <label>Вместо встречи</label>
            <select value={String(d['insteadOfEncounter'] ?? '')} onChange={(e) => set('insteadOfEncounter', e.target.value)}>
              {FLIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label>Получил повторно</label>
            <select value={String(d['onDuplicate'] ?? '')} onChange={(e) => set('onDuplicate', e.target.value)}>
              {FLIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {(String(d['front'] ?? '') || String(d['reckoning'] ?? '')) && (
          <div className="rf-note">
            Тексты лица: {String(d['front'] ?? '—')} · Расплата: {String(d['reckoning'] ?? '—')} — правятся в «Текстах».
          </div>
        )}
        {!String(d['front'] ?? '') && id && (
          <button onClick={() => patch({
            ...d,
            name: d['name'] || `COND_${upperSlug(id)}_NAME`,
            front: `COND_${upperSlug(id)}_FRONT`,
            reckoning: d['reckoning'] || `COND_${upperSlug(id)}_RECKONING`,
          })}
          >
            + ключи текстов лица
          </button>
        )}
      </div>

      <div className="prose-group">
        <div className="prose-group-title">Лицо — пока карта у сыщика</div>
        <EffField
          title="Локальное действие (тратит действие; обычно проверка → сбросить)"
          value={d['action']} onChange={(l) => set('action', l)} listProps={listProps}
        />
        <EffField
          title="В Расплату (чаще всего — перевернуть карту)"
          value={d['onReckoning']} onChange={(l) => set('onReckoning', l)} listProps={listProps}
        />
        <JsonField
          title="Пока на руках (whileHeld)"
          hint='Постоянные ограничения: [{"do":"successThreshold","value":6}], [{"do":"cannotMove"}]'
          value={d['whileHeld']} onChange={(v) => set('whileHeld', v)}
        />
        <JsonField
          title="Реакции на события (triggered)"
          hint='[{"on":"rest","do":[{"dieRoll":[{"on":"5-6","then":[{"do":"discardCard"}]}]}]}]'
          value={d['triggered']} onChange={(v) => set('triggered', v)}
        />
      </div>

      <div className="prose-group">
        <div className="prose-group-title">
          Обороты — исходы при перевороте. Сыщику достаётся случайный оборот из доступных сезонов
        </div>
        {backs.length === 0 && <div className="rf-note">Оборотов нет — переворачивать нечего.</div>}
        {backs.map((b, i) => (
          // Ключ — позиция, а не id: при вводе id блок иначе пересоздавался на каждую букву.
          <div key={i} className="spell-back">
            <div className="spell-back-head">
              <span className="spell-back-title">Оборот {i + 1}</span>
              {String(b['name'] ?? '') && <span className="spell-back-key">название: {String(b['name'])}</span>}
              {String(b['text'] ?? '') && <span className="spell-back-key">текст: {String(b['text'])}</span>}
            </div>
            <div className="row">
              <div>
                <label>Идентификатор оборота</label>
                <input value={String(b['id'] ?? '')} onChange={(e) => patchBack(i, { ...b, id: e.target.value })} />
              </div>
              <div>
                <label>Сезон</label>
                {seasonSelect(String(b['season'] ?? ''), (v) => {
                  const nb = { ...b };
                  if (v) nb['season'] = v; else delete nb['season'];
                  patchBack(i, nb);
                })}
              </div>
              <div>
                <label>После исхода</label>
                <select
                  value={String(b['then'] ?? '')}
                  onChange={(e) => {
                    const nb = { ...b };
                    if (e.target.value) nb['then'] = e.target.value; else delete nb['then'];
                    patchBack(i, nb);
                  }}
                >
                  {THEN.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <button className="danger" onClick={() => patchBack(i, null)}>Удалить оборот</button>
            </div>
            <EffectList
              {...listProps}
              value={Array.isArray(b['effect']) ? (b['effect'] as Eff[]) : []}
              onChange={(l) => patchBack(i, { ...b, effect: l })}
            />
          </div>
        ))}
        {/* Новый оборот — сразу с id и ключами текстов: поля для них появятся в «Текстах». */}
        <button
          onClick={() => {
            const n = nextBackNo(backs);
            const key = `OUTCOME_${upperSlug(id || 'condition')}_B${n}`;
            patchBacks([...backs, {
              id: `${id || 'condition'}_b${n}`, name: `${key}_NAME`, text: `${key}_TEXT`,
              effect: [], then: 'discard', season: String(d['season'] ?? '') || 'core',
            }]);
          }}
        >
          + оборот
        </button>
      </div>
    </div>
  );
}
