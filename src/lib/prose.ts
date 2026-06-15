// Структура полей прозы (i18n[locale]) под тип+вид. Форма зеркалит то, что читает
// assembleCard в relay:
//   general / research → плоско: name, mainText, successText, failureText
//   gate / mystery     → вложенно: name, stage1.{…}, successBranch.{…},
//                        failureBranch.{…}, + otherWorld (только gate)
// Пути даются в точечной нотации ('stage1.mainText') — get/set ниже их раскрывают.

export interface ProseField {
  path: string;        // точечный путь внутри i18n[locale]
  label: string;
  multiline: boolean;
}
export interface ProseGroup {
  title?: string;      // заголовок секции (для ветвящихся); нет → без заголовка
  fields: ProseField[];
}

const FLAT: ProseGroup[] = [{
  fields: [
    { path: 'name',        label: 'Название',           multiline: false },
    { path: 'mainText',    label: 'Завязка (mainText)', multiline: true },
    { path: 'successText', label: 'Успех',              multiline: true },
    { path: 'failureText', label: 'Провал',             multiline: true },
  ],
}];

function branchGroup(prefix: string, title: string): ProseGroup {
  return {
    title,
    fields: [
      { path: `${prefix}.mainText`,    label: 'Ситуация (вторая проверка)', multiline: true },
      { path: `${prefix}.successText`, label: 'Исход при успехе',           multiline: true },
      { path: `${prefix}.failureText`, label: 'Исход при провале',          multiline: true },
    ],
  };
}

function twoStage(withOtherWorld: boolean): ProseGroup[] {
  const groups: ProseGroup[] = [
    { fields: [{ path: 'name', label: 'Название', multiline: false }] },
    {
      title: 'Стадия 1 — первая проверка (маршрутизация, без эффектов)',
      fields: [
        { path: 'stage1.mainText',    label: 'Завязка',                          multiline: true },
        { path: 'stage1.successText', label: 'Мостик при успехе (→ ветка успеха)', multiline: true },
        { path: 'stage1.failureText', label: 'Мостик при провале (→ ветка провала)', multiline: true },
      ],
    },
    branchGroup('successBranch', 'Ветка успеха — вторая проверка'),
    branchGroup('failureBranch', 'Ветка провала — вторая проверка'),
  ];
  if (withOtherWorld) {
    groups.push({ fields: [{ path: 'otherWorld', label: 'Иной мир (название)', multiline: false }] });
  }
  return groups;
}

// Карта Тайны: title/flavorText/text/resolution (campaign-prompt.ts). `name` —
// это title (универсальный ключ заголовка, его же показывает список).
const MYSTERY_PROSE: ProseGroup[] = [{
  fields: [
    { path: 'name',       label: 'Название Тайны',            multiline: false },
    { path: 'flavorText', label: 'Завязка (атмосфера)',        multiline: true },
    { path: 'text',       label: 'Описание / как работает',     multiline: true },
    { path: 'resolution', label: 'Развязка (при раскрытии)',    multiline: true },
  ],
}];

// Карта Мифов: name + атмосфера + что происходит. Проверки и исхода НЕТ — карта
// применяется безусловно (onDraw), поэтому без success/failure. relay читает
// flavorText/text (mainText — легаси-фоллбэк), см. mapMythosRecord в campaign-corpus.
const MYTHOS_PROSE: ProseGroup[] = [{
  fields: [
    { path: 'name',       label: 'Название',            multiline: false },
    { path: 'flavorText', label: 'Завязка (атмосфера)', multiline: true },
    { path: 'text',       label: 'Что происходит',      multiline: true },
  ],
}];

// Древний: идентичность (как в config/ancients.json — name/epithet/description/awakening).
const ANCIENT_PROSE: ProseGroup[] = [{
  fields: [
    { path: 'name',        label: 'Имя Древнего',  multiline: false },
    { path: 'epithet',     label: 'Эпитет',        multiline: false },
    { path: 'description', label: 'Описание',      multiline: true },
    { path: 'awakening',   label: 'Пробуждение',   multiline: true },
  ],
}];

/** Раскладка полей прозы под тип/вид. */
export function proseSchema(type: string, kind: string): ProseGroup[] {
  if (type === 'encounter') {
    if (kind === 'gate')    return twoStage(true);
    if (kind === 'mystery') return twoStage(false);
    return FLAT;
  }
  if (type === 'mystery') return MYSTERY_PROSE;
  if (type === 'mythos')  return MYTHOS_PROSE;
  if (type === 'ancient') return ANCIENT_PROSE;
  // прочие типы — пока плоская тройка name/main/… (контракт уточним позже)
  return FLAT;
}

/** Все пути полей для (type, kind) — для запроса рыбы у LLM. */
export function prosePaths(type: string, kind: string): string[] {
  return proseSchema(type, kind).flatMap((g) => g.fields.map((f) => f.path));
}

// ── Вложенный доступ по точечному пути ────────────────────────────────────────────

type Obj = Record<string, unknown>;

export function getAt(obj: Obj | undefined, path: string): string {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (cur && typeof cur === 'object') cur = (cur as Obj)[k];
    else return '';
  }
  return typeof cur === 'string' ? cur : '';
}

/** Иммутабельная установка значения по точечному пути (создаёт промежуточные объекты). */
export function setAt(obj: Obj, path: string, val: unknown): Obj {
  const keys = path.split('.');
  const root: Obj = { ...obj };
  let cur: Obj = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    const child = cur[k];
    cur[k] = (child && typeof child === 'object' && !Array.isArray(child)) ? { ...(child as Obj) } : {};
    cur = cur[k] as Obj;
  }
  cur[keys[keys.length - 1]!] = val;
  return root;
}

/** Применить плоскую карту {path: value} к объекту (иммутабельно). */
export function setMany(obj: Obj, flat: Record<string, string>): Obj {
  let out = obj;
  for (const [k, v] of Object.entries(flat)) out = setAt(out, k, v);
  return out;
}

/** Сплющить вложенный объект до {path: string} (только строковые листья). */
export function flatten(obj: Obj, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Obj, key));
    }
  }
  return out;
}
