// Структура полей прозы (i18n[locale]) под тип+вид. Форма зеркалит то, что читает
// assembleCard в relay:
//   general / research → плоско: name, mainText, successText, failureText
//   gate / mystery     → вложенно: name, stage1.{…}, successBranch.{…},
//                        failureBranch.{…}
// Иной мир врат прозой НЕ является — он задаётся осью (тег world:<name>).
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

// Иного мира здесь НЕТ намеренно: мир — это ось карточки (тег world:<name>,
// выпадашка канонических миров в блоке подбора), а не проза. Пока он лежал среди
// текстов, его переводили как текст — 11 карточек из 92 уехали с «Сон Азатота»,
// «Прошлое», «Грядущее» вместо ключа, и игра не находила по ним арт мира.
function twoStage(): ProseGroup[] {
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
/** Типы-каталоги: тексты лежат НЕ по фиксированным полям, а по ключам перевода. */
const CATALOG_TYPES = new Set(['investigator', 'asset', 'spell', 'monster']);

/** Ключ перевода в данных карточки: ASSET_VAMPIRIC_TALISMAN_NAME. */
const KEY_RE = /^[A-Z][A-Z0-9_]{3,}$/;

/** Человеческая подпись по хвосту ключа; нет в словаре — покажем сам хвост. */
const KEY_LABELS: Record<string, string> = {
  NAME: 'Название', ABILITY: 'Способность', OCC: 'Профессия', QUOTE: 'Цитата',
  DESC: 'Описание', TITLE: 'Заголовок', TEXT: 'Текст', FLAVOR: 'Атмосфера',
  PASSIVE: 'Пассив', ACTION: 'Действие', BACK: 'Оборот', FRONT: 'Лицо',
};

function labelForKey(key: string, prefix: string): string {
  const tail = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  const parts = tail.split('_').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const guess = parts.slice(i).join('_');
    if (KEY_LABELS[guess]) return KEY_LABELS[guess];
  }
  return tail || key;
}

/**
 * Поля, чьи значения выглядят как ключи перевода, но текстом карточки НЕ
 * являются: это классификация. `set` — происхождение (INV_SET_CORE), `role` —
 * роль сыщика (INV_ROLE_COMBAT), и роли к тому же общие для всех: править их
 * копию внутри одной карточки бессмысленно и вредно.
 */
const NON_PROSE_FIELDS = new Set(['set', 'role', 'season']);

/** Все ключи перевода, встречающиеся в данных карточки (в порядке обхода). */
function keysIn(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    if (KEY_RE.test(node) && !out.includes(node)) out.push(node);
    return out;
  }
  if (Array.isArray(node)) { for (const v of node) keysIn(v, out); return out; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (NON_PROSE_FIELDS.has(k)) continue;
      keysIn(v, out);
    }
  }
  return out;
}

/**
 * Поля прозы для карточки-каталога: по одному на ключ перевода из её данных.
 *
 * Статической схемой это не выразить — ключи у каждой записи свои
 * (ASSET_VAMPIRIC_TALISMAN_NAME), и придумывать их за автора нельзя. Поэтому
 * читаем сами данные: что в них названо ключом, то и редактируем.
 *
 * Многострочность по длине хвоста: NAME/OCC — строка, ABILITY/QUOTE — абзац.
 */
export function catalogProse(data: unknown, type: string): ProseGroup[] {
  const prefix = type === 'investigator' ? 'INV_' : `${type.toUpperCase()}_`;
  const fields: ProseField[] = keysIn(data).map((key) => {
    const human = labelForKey(key, prefix);
    // Подпись не угадалась (ключ чужого префикса, напр. RECK_*) — показываем
    // только сам ключ, а не `KEY · KEY`.
    return {
      path: key,
      label: human === key ? key : `${human}  ·  ${key}`,
      multiline: !/_(NAME|OCC|TITLE)$/.test(key),
    };
  });
  return fields.length ? [{ fields }] : [];
}

export function proseSchema(type: string, kind: string, data?: unknown): ProseGroup[] {
  if (CATALOG_TYPES.has(type)) return catalogProse(data, type);
  if (type === 'encounter') {
    if (kind === 'gate' || kind === 'mystery') return twoStage();
    return FLAT;
  }
  if (type === 'mystery') return MYSTERY_PROSE;
  if (type === 'mythos')  return MYTHOS_PROSE;
  if (type === 'ancient') return ANCIENT_PROSE;
  // прочие типы — пока плоская тройка name/main/… (контракт уточним позже)
  return FLAT;
}

/** Все пути полей для (type, kind) — для запроса рыбы у LLM. */
export function prosePaths(type: string, kind: string, data?: unknown): string[] {
  return proseSchema(type, kind, data).flatMap((g) => g.fields.map((f) => f.path));
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
