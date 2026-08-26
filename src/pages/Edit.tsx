import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useContent, useMeta, useSaveContent, useDeleteContent, useDraft, useTranslate,
} from '@/hooks';
import {
  CONTENT_TYPES, kindsFor, LOCALES, type ContentRecord, type Locale,
} from '@/lib/types';
import { dataTemplate, isPristineData } from '@/lib/templates';
import {
  proseSchema, prosePaths, getAt, setAt, setMany, flatten,
} from '@/lib/prose';
import { splitTags, joinTags, matchAxes, type MatchTags } from '@/lib/match';
import { AutoTextarea } from '@/components/auto-textarea';
import { EncounterFlow } from '@/components/dsl/encounter-flow';
import { MysteryFlow } from '@/components/dsl/mystery-flow';
import { MythosForm } from '@/components/dsl/mythos-form';
import { AncientForm } from '@/components/dsl/ancient-form';
import { useToast } from '@/components/toast';
import { EncounterAnalysis } from '@/components/EncounterAnalysis';

const EMPTY: ContentRecord = {
  id: '', type: 'encounter', kind: 'general', status: 'draft', tags: [],
  data: dataTemplate('encounter', 'general'),
  i18n: { en: {}, ru: {} },
};

export function EditPage() {
  const navigate = useNavigate();
  const { id: rawId } = useParams<{ id: string }>();
  const id = decodeURIComponent(rawId ?? 'new');
  const isNew = id === 'new';

  const [rec, setRec] = useState<ContentRecord>(EMPTY);
  const [dataText, setDataText] = useState(JSON.stringify(EMPTY.data, null, 2));
  const [mechView, setMechView] = useState<'nodes' | 'json'>('nodes');   // вид секции «Механика»
  const [locale, setLocale] = useState<Locale>('en');
  const [brief, setBrief] = useState('');   // подсказка для рыбы (эфемерная, не в записи)
  const [freeText, setFreeText] = useState('');   // сырой буфер ввода тематических тегов
  const [showAnalysis, setShowAnalysis] = useState(false);   // модалка расчёта вероятностей
  const toast = useToast();

  const { data: meta } = useMeta();
  const query = useContent(id, !isNew);
  const saveMut = useSaveContent();
  const delMut = useDeleteContent();
  const draftMut = useDraft();
  const translateMut = useTranslate();
  const busy = saveMut.isPending || delMut.isPending || draftMut.isPending || translateMut.isPending;

  // Заполняем форму один раз на каждый id: при создании — шаблон, иначе — из корпуса.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (isNew) {
      if (seededRef.current === 'new') return;
      setRec({ ...EMPTY, i18n: { en: {}, ru: {} } });
      setDataText(JSON.stringify(dataTemplate(EMPTY.type, EMPTY.kind), null, 2));
      setFreeText('');
      setLocale('en');
      seededRef.current = 'new';
      return;
    }
    const r = query.data;
    if (!r || seededRef.current === id) return;
    setRec({ ...EMPTY, ...r, i18n: { en: {}, ru: {}, ...r.i18n } });
    setDataText(JSON.stringify(r.data ?? {}, null, 2));
    setFreeText(splitTags(r.tags ?? []).free.join(', '));
    // Открыть локаль, в которой реально есть текст (автор мог заполнить только RU).
    const hasText = (loc: Locale) =>
      Object.values(flatten((r.i18n?.[loc] ?? {}) as Record<string, unknown>))
        .some((s) => s.trim() !== '');
    setLocale(LOCALES.find(hasText) ?? 'en');
    seededRef.current = id;
  }, [isNew, id, query.data]);

  useEffect(() => {
    if (query.error) toast.error((query.error as Error).message);
  }, [query.error, toast]);

  const prose = (path: string) => getAt(rec.i18n[locale] ?? {}, path);
  function setProse(path: string, val: string) {
    setRec((r) => ({
      ...r, i18n: { ...r.i18n, [locale]: setAt(r.i18n[locale] ?? {}, path, val) },
    }));
  }

  // Смена типа/вида: если механика ещё не тронута (пуста или равна шаблону старого
  // type/kind) — подставляем шаблон нового. Если правил руками — не затираем.
  function applyTypeKind(nextType: string, nextKind: string) {
    if (isPristineData(dataText, rec.type, rec.kind)) {
      setDataText(JSON.stringify(dataTemplate(nextType, nextKind), null, 2));
    }
    setRec((r) => ({ ...r, type: nextType, kind: nextKind }));
  }

  // Смена типа: подбираем валидный для него вид (текущий, если подходит, иначе
  // первый доступный; для типов без видов — пусто).
  function changeType(nextType: string) {
    const ks = kindsFor(nextType);
    const nextKind = ks.includes(rec.kind) ? rec.kind : (ks[0] ?? '');
    applyTypeKind(nextType, nextKind);
  }

  // Опции вида под текущий тип; неизвестный вид загруженной записи не теряем.
  const kindList = kindsFor(rec.type);
  const kindOptions = rec.kind && !kindList.includes(rec.kind)
    ? [rec.kind, ...kindList]
    : [...kindList];

  // Оси матчинга (хранятся в tags с префиксами) + свободные теги.
  const m = splitTags(rec.tags);
  const axes = matchAxes(rec.type, rec.kind);
  function setMatch(patch: Partial<MatchTags>) {
    setRec((r) => ({ ...r, tags: joinTags({ ...splitTags(r.tags), ...patch }) }));
  }

  // Ручной сброс механики к шаблону под текущий type/kind (с подтверждением, если правил).
  function resetTemplate() {
    if (!isPristineData(dataText, rec.type, rec.kind)
        && !window.confirm('Заменить текущую механику шаблоном под выбранный тип/вид?')) return;
    setDataText(JSON.stringify(dataTemplate(rec.type, rec.kind), null, 2));
  }

  async function save() {
    let data: Record<string, unknown>;
    try { data = JSON.parse(dataText) as Record<string, unknown>; }
    catch { toast.error('Поле «механика (data)» — невалидный JSON'); return; }
    try {
      const saved = await saveMut.mutateAsync({ id, isNew, rec: { ...rec, data } });
      if (isNew) {
        seededRef.current = saved.id;
        setRec({ ...EMPTY, ...saved, i18n: { en: {}, ru: {}, ...saved.i18n } });
        setDataText(JSON.stringify(saved.data ?? {}, null, 2));
        navigate(`/edit/${encodeURIComponent(saved.id)}`, { replace: true });
      }
      toast.success('Сохранено');
    } catch (e) { toast.error((e as Error).message); }
  }

  async function genDraft() {
    // Текущая механика → контекст для LLM, чтобы проза билась с проверками/эффектами.
    let mechanics: Record<string, unknown> | undefined;
    try { mechanics = JSON.parse(dataText) as Record<string, unknown>; } catch { mechanics = undefined; }
    try {
      const { fields } = await draftMut.mutateAsync({
        type: rec.type, kind: rec.kind, tags: rec.tags,
        fields: prosePaths(rec.type, rec.kind), language: locale, mechanics,
        brief: brief.trim() || undefined,
      });
      setRec((r) => ({ ...r, i18n: { ...r.i18n, [locale]: setMany(r.i18n[locale] ?? {}, fields) } }));
    } catch (e) { toast.error((e as Error).message); }
  }

  async function translate() {
    const from = locale;
    const to: Locale = locale === 'en' ? 'ru' : 'en';
    const srcFlat = flatten(rec.i18n[from] ?? {});
    if (Object.keys(srcFlat).length === 0) {
      toast.error(`Нечего переводить: локаль ${from.toUpperCase()} пуста — заполни её сначала`);
      return;
    }
    try {
      const { fields } = await translateMut.mutateAsync({ fields: srcFlat, from, to });
      setRec((r) => ({ ...r, i18n: { ...r.i18n, [to]: setMany(r.i18n[to] ?? {}, fields) } }));
      setLocale(to);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function del() {
    if (!window.confirm('Удалить запись безвозвратно?')) return;
    try { await delMut.mutateAsync(id); navigate('/'); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
    <div className="min-w-0">
      <h2>{isNew ? 'Новая запись' : `Правка: ${getAt(rec.i18n.en, 'name') || id}`}</h2>
      {rec.type === 'encounter' && (
        <button type="button" onClick={() => setShowAnalysis(true)} style={{ marginBottom: 12 }}>
          📊 Анализ встречи
        </button>
      )}
      {showAnalysis && (
        <EncounterAnalysis rec={rec} meta={meta} onClose={() => setShowAnalysis(false)} />
      )}

      <section className="section">
      <div className="section-title">Классификация</div>
      <div className="row">
        <div>
          <label>Тип</label>
          <select value={rec.type} onChange={(e) => changeType(e.target.value)} disabled={!isNew}>
            {(CONTENT_TYPES as readonly string[]).includes(rec.type)
              ? null
              : <option value={rec.type}>{rec.type} (?)</option>}
            {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label>Вид</label>
          <select value={rec.kind} onChange={(e) => applyTypeKind(rec.type, e.target.value)} disabled={!isNew}>
            {kindOptions.length === 0
              ? <option value="">—</option>
              : kindOptions.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label>Статус</label>
          <select
            value={rec.status}
            onChange={(e) => setRec({ ...rec, status: e.target.value as ContentRecord['status'] })}
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </div>

        <div>
          {/* Сезон — ось ДОСТУПНОСТИ, поэтому стоит рядом со статусом, а не в
              «контексте выборки»: и то и другое отвечает на вопрос «когда эта
              карточка доедет до игрока». Пусто = в игру не попадёт. */}
          <label>Сезон</label>
          <select value={m.season} onChange={(e) => setMatch({ season: e.target.value })}>
            <option value="">— не размечено (недоступно) —</option>
            {meta?.seasons?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {m.season && !meta?.seasons?.some((s) => s.id === m.season) &&
              <option value={m.season}>{m.season} (?)</option>}
          </select>
        </div>
        {rec.type === 'ancient' && (
          <div>
            <label>ID / slug{!isNew && ' (фиксирован)'}</label>
            <input
              value={rec.id}
              disabled={!isNew}
              onChange={(e) => setRec({ ...rec, id: e.target.value.trim() })}
              placeholder="cthulhu"
            />
          </div>
        )}
      </div>
      </section>

      <section className="section">
      <div className="section-title">Контекст выборки из корпуса</div>
      {(axes.ancient || axes.loc || axes.location || axes.world || axes.act) && (
        <div className="row">
          {axes.ancient && (
            <div>
              <label>Древний</label>
              <select value={m.ancient || 'any'} onChange={(e) => setMatch({ ancient: e.target.value })}>
                <option value="any">Любой (общая)</option>
                {meta?.ancients.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                {m.ancient && m.ancient !== 'any' && !meta?.ancients.some((a) => a.id === m.ancient) &&
                  <option value={m.ancient}>{m.ancient} (?)</option>}
              </select>
            </div>
          )}
          {axes.loc && (
            <div>
              <label>Тип локации</label>
              <select value={m.loc} onChange={(e) => setMatch({ loc: e.target.value })}>
                <option value="">— любая —</option>
                {meta?.locationTypes.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          {axes.location && (
            <div>
              <label>Локация (привязка)</label>
              <select value={m.location} onChange={(e) => setMatch({ location: e.target.value })}>
                <option value="">— любая (по типу) —</option>
                {meta?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                {m.location && !meta?.locations.some((l) => l.id === m.location) &&
                  <option value={m.location}>{m.location} (?)</option>}
              </select>
            </div>
          )}
          {axes.world && (
            <div>
              <label>Иной мир</label>
              <select value={m.world} onChange={(e) => setMatch({ world: e.target.value })}>
                <option value="">— любой —</option>
                {meta?.otherWorlds.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          )}
          {axes.act && (
            <div>
              <label>Акт</label>
              <select value={m.act} onChange={(e) => setMatch({ act: e.target.value })}>
                <option value="">— любой —</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          )}
        </div>
      )}

      <label>Теги (тематические, через запятую)</label>
      <input
        value={freeText}
        onChange={(e) => {
          setFreeText(e.target.value);   // сырой буфер — разделители не съедаются
          setMatch({ free: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) });
        }}
        placeholder="docks, ritual, npc:marsh"
        className="w-full"
      />
      </section>

      <section className="section">
      <div className="section-title">Тексты</div>
      <div className="tabs">
        {LOCALES.map((l) => (
          <button key={l} className={l === locale ? 'active' : ''} onClick={() => setLocale(l)}>
            {l.toUpperCase()}
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={() => void genDraft()} disabled={busy}>✨ Рыба (LLM, {locale})</button>
        <button onClick={() => void translate()} disabled={busy}>
          {locale.toUpperCase()}→{locale === 'en' ? 'RU' : 'EN'} перевод
        </button>
      </div>

      <div className="field">
        <label>Подсказка для рыбы (опц.) — направляет генерацию, не заменяет тип/вид/механику</label>
        <AutoTextarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={600}
          placeholder="напр.: контрабандисты в порту, упор на паранойю, без прямого насилия"
          className="min-h-[42px]"
        />
      </div>

      {proseSchema(rec.type, rec.kind).map((group, gi) => (
        <div key={gi} className="prose-group">
          {group.title && <div className="prose-group-title">{group.title}</div>}
          {group.fields.map((f) => (
            <div key={f.path} className="field">
              <label>{f.label}</label>
              {f.multiline
                ? <AutoTextarea value={prose(f.path)} onChange={(e) => setProse(f.path, e.target.value)} />
                : <input value={prose(f.path)} onChange={(e) => setProse(f.path, e.target.value)} className="w-full" />}
            </div>
          ))}
        </div>
      ))}
      </section>

      <div className="flex gap-2.5 mt-[18px]">
        <button className="primary" onClick={() => void save()} disabled={busy}>
          {busy ? '…' : 'Сохранить'}
        </button>
        {!isNew && <button className="danger" onClick={() => void del()}>Удалить</button>}
      </div>
      </div>

      <aside className="lg:sticky lg:top-[68px] lg:h-[calc(100vh-96px)] min-w-0">
      <section className="section mech-panel">
      <div className="section-title">Механика</div>
      {(() => {
        const canBuild = ['encounter', 'mystery', 'mythos', 'ancient'].includes(rec.type);
        const view = canBuild ? mechView : 'json';
        return (
          <>
            <div className="tabs">
              {canBuild && (
                <button
                  type="button"
                  className={view === 'nodes' ? 'active' : ''}
                  onClick={() => setMechView('nodes')}
                >
                  Конструктор
                </button>
              )}
              <button
                type="button"
                className={view === 'json' ? 'active' : ''}
                onClick={() => setMechView('json')}
              >
                JSON
              </button>
              <span className="flex-1" />
              <button type="button" onClick={resetTemplate} title="Заменить механику стартовым шаблоном">
                ↻ Шаблон
              </button>
            </div>

            <div className="mech-body">
            {view === 'nodes' ? (
              rec.type === 'encounter'
                ? <EncounterFlow value={dataText} onChange={setDataText} meta={meta ?? undefined} />
                : rec.type === 'mystery'
                  ? <MysteryFlow value={dataText} onChange={setDataText} meta={meta ?? undefined} />
                  : rec.type === 'mythos'
                    ? <MythosForm value={dataText} onChange={setDataText} meta={meta ?? undefined} />
                    : rec.type === 'ancient'
                      ? <AncientForm value={dataText} onChange={setDataText} meta={meta ?? undefined} />
                      // У каталогов (investigator/asset/spell/monster) своей формы
                      // пока нет. Раньше сюда проваливался AncientForm и рисовал
                      // чужие поля — лучше честный JSON, чем неверная форма.
                      : (
                        <AutoTextarea
                          className="mech-json"
                          value={dataText}
                          onChange={(e) => setDataText(e.target.value)}
                          spellCheck={false}
                        />
                      )
            ) : (
              <>
                <textarea
                  className="mech-json"
                  value={dataText}
                  onChange={(e) => setDataText(e.target.value)}
                  spellCheck={false}
                />
                {meta?.dsl && (
                  <details className="dsl-ref">
                    <summary>Справка по DSL — допустимые значения полей</summary>
                    <div className="dsl-ref-body">
                      <p><b>Узел-действие:</b> <span className="mono">{'{ "do": <verb>, "target"?, "amount"?|"count"?, "when"?, "repeat"? }'}</span></p>
                      <p><b>Вложенная проверка:</b> <span className="mono">{'{ "test": <skill>, "modifier"?, "onPass": [...], "onFail": [...] }'}</span></p>
                      <p><b>Выбор / группа:</b> <span className="mono">{'{ "choice": [<eff>, <eff>] }'}</span> · <span className="mono">{'{ "group": [<eff>] }'}</span></p>
                      <p><b>forEach / бросок:</b> <span className="mono">{'{ "forEach": "each", "do": [<eff>] }'}</span> · <span className="mono">{'{ "dieRoll": [{ "on": "6", "then": [...] }] }'}</span></p>
                      <p className="dsl-ref-note">forEach: проход по сыщикам (Ведущий первым), у каждого свой выбор; внутри <span className="mono">rightNeighbor</span>/<span className="mono">leftNeighbor</span> — от текущего сыщика.</p>
                      <p><b>skill:</b> <span className="mono">{meta.dsl.skills.join(', ')}</span></p>
                      <p><b>do (verb):</b> <span className="mono">{meta.dsl.actionVerbs.join(', ')}</span></p>
                      <p><b>target:</b> <span className="mono">{meta.dsl.targets.join(', ')}</span></p>
                      <p><b>condition:</b> <span className="mono">{meta.dsl.conditions.join(', ')}</span></p>
                      {rec.type === 'mystery' && (
                        <>
                          <p><b>solveCondition.kind:</b> <span className="mono">{(meta.dsl.mysterySolveKinds ?? []).join(', ')}</span></p>
                          <p><b>progressHook.trigger:</b> <span className="mono">{(meta.dsl.mysteryTriggers ?? []).join(', ')}</span></p>
                        </>
                      )}
                    </div>
                  </details>
                )}
              </>
            )}
            </div>
          </>
        );
      })()}
      </section>
      </aside>
    </div>
  );
}
