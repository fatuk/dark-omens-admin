// Запись корпуса контента (зеркало relay /admin/content).

export type Locale = 'en' | 'ru';
export const LOCALES: Locale[] = ['en', 'ru'];

// Виды контента (тип-агностичный CMS). Добавишь сюда — появится в селектах.
//
// Каталоги игры (investigator/asset/spell/monster) перенесены сюда из статических
// data/*.json: CMS — источник правды, файлы сборки — генерируемый артефакт.
// Записи неизвестного типа страница правки всё равно открывает — селект
// подставляет им пункт «(?)».
//
// `location` — половинчатый случай: в CMS живут ТОЛЬКО тексты (название,
// реальное место, описание). Граф доски — связи, координаты, тип клетки —
// остаётся в data/locations.json игры и источником правды тоже остаётся там,
// экспорт его не трогает. Карточка несёт лишь id и три ключа перевода.
//
// `artifact` — единственный каталог, у которого в игре ПОКА НЕТ приёмника:
// движок кладёт по gainArtifact строку-маркер, каталога артефактов нет (см.
// relay EFFECT-DSL.md §15.12). Карточки заводим здесь заранее, экспорт в
// data/*.json подключим вместе с движковой колодой — генерировать файл,
// который никто не читает, значит заводить ту самую мёртвую лексику.
// По алфавиту — так же рисуются селекторы типа в списке и редакторе.
// `condition` — состояния (лицо + обороты-исходы); экспорт → data/conditions.json.
export const CONTENT_TYPES = [
  'ancient', 'artifact', 'asset', 'condition', 'encounter', 'investigator',
  'location', 'monster', 'mystery', 'mythos', 'spell',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// Виды встреч — РОВНО как в движке relay (encounter-prompt.ts):
//   general  — обычная встреча на локации        (одностадийная)
//   research — встреча по улике                   (одностадийная)
//   gate     — Иной мир за вратами                (двухфазная, ветки)
//   mystery  — встреча на локации активной Тайны  (двухфазная, ветки)
export const ENCOUNTER_KINDS = ['general', 'research', 'gate', 'mystery'] as const;

// Доступные «виды» зависят от типа. encounter — реальные виды движка;
// mythos — цвета карт Древнего ужаса; mystery — без под-вида.
// Пустой список ⇒ вид не применим (kind = '').
export const KINDS_BY_TYPE: Record<string, readonly string[]> = {
  encounter: ENCOUNTER_KINDS,
  mythos:    ['green', 'yellow', 'blue'],   // цвета карт Мифов (как в ДУ)
  mystery:   [],
  ancient:   [],
};

export function kindsFor(type: string): readonly string[] {
  return KINDS_BY_TYPE[type] ?? [];
}

// Плоская карта текстов одной локали для LLM-обмена (рыба/перевод). Ключи —
// точечные пути полей ('name', 'stage1.mainText'), значения — строки.
export type LocaleText = Record<string, string>;

export interface ContentRecord {
  id: string;
  type: string;
  kind: string;
  status: 'draft' | 'published';
  tags: string[];
  data: Record<string, unknown>;          // механика + мета
  // Проза по локалям. Для flat — плоско { name, mainText, … }; для ветвящихся
  // (gate/mystery) — вложенно { name, stage1:{…}, successBranch:{…}, … }.
  i18n: Partial<Record<Locale, Record<string, unknown>>>;
  createdAt?: number;
  updatedAt?: number;
  /** Ответ сохранения: предупреждения контента (запись сохранена), напр. тихие проверки. */
  warnings?: string[];
}

export interface ContentListItem {
  id: string;
  type: string;
  kind: string;
  status: string;
  tags: string[];
  title: string | null;
  /** Карточка полностью готова после редактуры (ручная отметка автора, data.isReady). */
  isReady: boolean;
  updatedAt: number;
}
