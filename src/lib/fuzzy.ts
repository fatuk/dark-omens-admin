// Нечёткий поиск для списков админки.
//
// Зачем не `includes`: карточки адресуются по-разному. У встреч есть название,
// у каталогов его нет вовсе — в списке видно id (`de_vermis_mysteriis`), а имя
// живёт по ключу перевода. Плюс половина корпуса называется по-русски, а id
// латиницей. Поэтому ищем ПОДПОСЛЕДОВАТЕЛЬНОСТЬ по нескольким полям сразу:
// «некр» находит «Некрономикон», «dvm» — de_vermis_mysteriis, «loc12» — карточку
// локации.
//
// Ранжирование намеренно простое и предсказуемое: точное вхождение всегда выше
// разрозненного совпадения, совпадение с начала слова выше совпадения из
// середины. Чем ближе к началу строки — тем выше.

// Раскладка клавиатуры. Половина корпуса называется по-русски, а id — латиницей,
// и переключить раскладку перед поиском забываешь постоянно: набираешь «Некро»,
// а в поле «Ytrhj». Поэтому если запрос не нашёл НИЧЕГО, пробуем ещё раз, пересыпав
// его между раскладками. Это не транслитерация: «двм» так и не найдёт De Vermis
// Mysteriis — там другие буквы, а не другие клавиши.
const QWERTY = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const JCUKEN = 'йцукенгшщзхъфывапролджэячсмитьбё';

const TO_RU = new Map<string, string>();
const TO_EN = new Map<string, string>();
for (let i = 0; i < QWERTY.length; i++) {
  const en = QWERTY[i] as string;
  const ru = JCUKEN[i] as string;
  TO_RU.set(en, ru);
  TO_EN.set(ru, en);
}

/** Перебить строку в другую раскладку. Незнакомые символы остаются как есть. */
function swapLayout(s: string): string {
  let out = '';
  let changed = false;
  for (const ch of s) {
    const to = TO_RU.get(ch) ?? TO_EN.get(ch);
    if (to) { out += to; changed = true; } else out += ch;
  }
  return changed ? out : '';
}

/** Регистр, ё→е и пробелы по краям: «Ёж» и «еж» должны находиться одинаково. */
function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim();
}

/** Начало слова — для бонуса за совпадение по границе, а не из середины. */
function isBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  return /[\s_\-./:]/.test(text[i - 1] ?? '');
}

/**
 * Насколько строка подходит запросу. `null` — не подходит вовсе.
 * Больше — лучше; абсолютное значение смысла не имеет, сравнивать только между собой.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = norm(query);
  const t = norm(text);
  if (!q) return 0;
  if (!t) return null;

  // Точное вхождение — отдельная, заведомо более высокая полка: 1000+.
  const at = t.indexOf(q);
  if (at >= 0) {
    return 1000 + (isBoundary(t, at) ? 100 : 0) + Math.max(0, 50 - at);
  }

  // Иначе — подпоследовательность: буквы запроса по порядку, но с разрывами.
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 + (isBoundary(t, found) ? 5 : 0);
    ti = found + 1;
  }
  // Короткая строка при том же совпадении релевантнее длинной.
  return score + Math.max(0, 20 - t.length / 4);
}

/** Лучший счёт по нескольким полям строки (null — не подошла ни одним). */
function bestOf(query: string, fields: (string | null | undefined)[]): number | null {
  let best: number | null = null;
  for (const f of fields) {
    if (!f) continue;
    const s = fuzzyScore(query, f);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

/**
 * Лучший счёт по полям строки, с запасным проходом в другой раскладке.
 * Совпадение «не в той раскладке» намеренно оценивается ниже: если нашлось и
 * так и так, честное совпадение должно быть выше.
 */
export function fuzzyScoreAny(query: string, fields: (string | null | undefined)[]): number | null {
  const direct = bestOf(query, fields);
  if (direct !== null) return direct;
  const swapped = swapLayout(query);
  if (!swapped) return null;
  const alt = bestOf(swapped, fields);
  return alt === null ? null : alt - 500;
}

/**
 * Отфильтровать и переупорядочить строки по релевантности.
 * Пустой запрос — список как есть, порядок не трогаем.
 */
export function fuzzyFilter<T>(
  rows: readonly T[],
  query: string,
  fieldsOf: (row: T) => (string | null | undefined)[],
): T[] {
  if (!query.trim()) return [...rows];
  const scored: { row: T; score: number }[] = [];
  for (const row of rows) {
    const s = fuzzyScoreAny(query, fieldsOf(row));
    if (s !== null) scored.push({ row, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.row);
}
