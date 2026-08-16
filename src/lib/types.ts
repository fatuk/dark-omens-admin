// Запись корпуса контента (зеркало relay /admin/content).

export type Locale = 'en' | 'ru';
export const LOCALES: Locale[] = ['en', 'ru'];

// Виды контента (тип-агностичный CMS). Добавишь сюда — появится в селектах.
//
// Активов и артефактов здесь НЕТ намеренно: это статические карточки, они живут
// в data/assets.json игры, а не в корпусе. Записи прежних типов, если такие
// остались, страница правки всё ещё открывает — селект подставляет им пункт «(?)».
export const CONTENT_TYPES = ['encounter', 'mystery', 'mythos', 'ancient'] as const;
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
}

export interface ContentListItem {
  id: string;
  type: string;
  kind: string;
  status: string;
  tags: string[];
  title: string | null;
  updatedAt: number;
}
