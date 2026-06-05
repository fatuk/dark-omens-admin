// Стартовый «скелет» механики (поле data) под тип+вид контента. Форма зеркалит
// то, что собирает движок relay (assembleCard / encounter-tables.ts):
//   general/research (1 фаза) → FlatMechanics  { test, onSuccess, onFailure }
//   gate/mystery     (2 фазы) → GateMechanics  { stage1, successBranch, failureBranch }
// Проза (mainText/successText/…) живёт в i18n, не здесь.
//
// Каждый вызов возвращает СВЕЖИЙ объект (литералы) — без общих ссылок, чтобы
// мутации формы не протекали между записями.

export function dataTemplate(type: string, kind: string): Record<string, unknown> {
  if (type === 'encounter') {
    if (kind === 'gate' || kind === 'mystery') {
      return {
        stage1: { test: { skill: 'lore', modifier: 0 } },
        successBranch: {
          test: { skill: 'observation', modifier: 0 },
          onSuccess: [{ do: 'gainClue', count: 1 }],
          onFailure: [{ do: 'loseHealth', amount: 1 }],
        },
        failureBranch: {
          test: { skill: 'will', modifier: -1 },
          onSuccess: [{ do: 'healSanity', amount: 1 }],
          onFailure: [{ do: 'loseSanity', amount: 2 }],
        },
      };
    }
    // general / research — одностадийные (одна проверка)
    return {
      test: { skill: 'observation', modifier: 0 },
      onSuccess: [{ do: 'gainClue', count: 1 }],
      onFailure: [{ do: 'loseSanity', amount: 1 }],
    };
  }
  // Прочие типы — контракт ещё не зафиксирован в движке; даём провизорный скелет
  // под слоты Effect-DSL, чтобы было от чего отталкиваться.
  if (type === 'asset' || type === 'artifact') {
    return {
      traits: ['item'],
      passive: [{ do: 'rerollDice', count: 1, context: 'anyTest' }],
      triggered: [],
      action: null,
    };
  }
  if (type === 'mythos') {
    return { onReveal: [{ do: 'advanceDoom', amount: 1 }], ongoing: [] };
  }
  // Древний — рецепт кампании: трек рока, локации Тайн по актам и СХЕМА колоды
  // Мифов (сколько карт каждого цвета на акт; пул Мифов берётся per-ancient).
  if (type === 'ancient') {
    return {
      doomClock: 14,
      mysteryLocations: { byAct: { '1': [], '2': [], '3': [] } },
      mythosDeck: {
        byAct: {
          '1': { green: 2, yellow: 1, blue: 1 },
          '2': { green: 2, yellow: 2, blue: 1 },
          '3': { green: 3, yellow: 2, blue: 1 },
        },
      },
    };
  }
  // Карта Тайны (зеркалит структуру движка: campaign-prompt.ts mysteries[*]).
  // Проза (title/flavorText/text/resolution) живёт в i18n; здесь — механика.
  if (type === 'mystery') {
    return {
      act: 1,
      solveCondition: { kind: 'cluesOnCard', n: 6 },
      progressHook: {
        trigger: 'researchEncounterResolved',
        effect: [{ do: 'placeClue', count: 1 }],
      },
      onEnter: [],
    };
  }
  return {};
}

/** Нормализованное сравнение двух JSON-строк (порядок ключей сохраняется). */
export function sameJson(a: string, b: string): boolean {
  try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); }
  catch { return false; }
}

/** data считается «нетронутой», если пуста или совпадает с шаблоном type/kind. */
export function isPristineData(dataText: string, type: string, kind: string): boolean {
  const t = dataText.trim();
  if (t === '' || t === '{}') return true;
  return sameJson(dataText, JSON.stringify(dataTemplate(type, kind)));
}
