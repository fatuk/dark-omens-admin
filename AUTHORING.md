# Dark Omens — авторинг контента (CMS)

Практический гайд по созданию карточек в админке (`localhost:3040`). Опубликованные
(`status: published`) карточки игра берёт **из корпуса** (corpus-only): LLM в рантайме
больше не вызывается, проза и механика — авторские.

- Полная грамматика эффектов: **`dark-omens-relay/EFFECT-DSL.md`**.
- Бонусы локаций: **`dark-omens/data/REWARD-AFFINITY.md`**.

---

## 1. Карточка: общие поля

| Поле | Что |
|---|---|
| `type` | encounter · mystery · mythos · asset · artifact · ancient |
| `kind` | под-вид (зависит от типа, см. ниже) |
| `status` | `draft` (черновик) или `published` (попадает в игру) |
| теги | **контекст матчинга** (структурные селекты) + тематические (freeform) |
| `data` | механика — JSON, формы ниже |
| `i18n` | проза по локалям `{ en:{…}, ru:{…} }` |

Кнопка **«✨ Рыба (LLM)»** генерит ОРИГИНАЛЬНУЮ прозу под текущие тип/вид/теги/механику
в активную локаль (поле «Подсказка для рыбы» направляет, не заменяя вводные). **«Перевод»**
переводит активную локаль в другую.

---

## 2. Виды (`kind`) по типам

| Тип | Виды |
|---|---|
| encounter | `general` · `research` (одностадийные) · `gate` · `mystery` (двухфазные) |
| mythos | `green` · `yellow` · `blue` (цвета ДУ) |
| asset / artifact | трейты: weapon · magical · item · tome · trinket · ally · service · relic |
| mystery (карта Тайны) | — |
| ancient | — |

---

## 3. Теги матчинга — как игра находит карточку

Структурные оси кодируются префиксными тегами (в админке — селекты):

| Тег | Значение | Для чего |
|---|---|---|
| `ancient:<id>` | конкретный Древний (или `any` = общая) | encounter / mystery / mythos |
| `loc:<type>` | `city` · `wilderness` · `sea` | encounter general/research/mystery |
| `world:<id>` | Иной мир | encounter gate |
| `act:<1\|2\|3>` | акт | research, mystery |

Выборка: сначала карточки **этого Древнего** → потом общие (`any`/без тега) → если ничего
нет, движок ставит **минимальную заглушку** (механическая карта без флейвора). Остальные
теги — тематические (freeform), на матчинг не влияют.

---

## 4. Формы `data` по типам

### encounter · general / research (одностадийная)
```json
{
  "test": { "skill": "observation", "modifier": 0 },
  "onSuccess": [ { "do": "gainClue", "count": 1 } ],
  "onFailure": [ { "do": "loseSanity", "amount": 1 } ]
}
```

### encounter · gate / mystery (двухфазная)
Стадия 1 только МАРШРУТИЗИРУЕТ (без эффектов); эффекты — в ветках.
```json
{
  "stage1": { "test": { "skill": "lore", "modifier": 0 } },
  "successBranch": {
    "test": { "skill": "observation", "modifier": 0 },
    "onSuccess": [ { "do": "gainClue", "count": 1 } ],
    "onFailure": [ { "do": "loseHealth", "amount": 1 } ]
  },
  "failureBranch": {
    "test": { "skill": "will", "modifier": -1 },
    "onSuccess": [ { "do": "healSanity", "amount": 1 } ],
    "onFailure": [ { "do": "loseSanity", "amount": 2 } ]
  }
}
```

### mystery (карта Тайны)
```json
{
  "act": 1,
  "solveCondition": { "kind": "cluesOnCard", "n": 6 },
  "progressHook": { "trigger": "researchEncounterResolved", "effect": [ { "do": "placeClue", "count": 1 } ] },
  "onEnter": []
}
```
- `solveCondition.kind`: `cluesOnCard` · `tokensOnCard` · `monsterDefeated`.
  - **cluesOnCard** — `n` (число помеченных локаций) движок сам масштабирует по числу
    игроков (per-акт формула); `perPlayer` не задаём.
  - **tokensOnCard** — **всегда задавай `perPlayer`** (множитель по числу игроков):
    `0.5` = половина (вверх), `1` = по числу игроков, `2` = вдвое. `n` — только для
    фиксированного числа без масштаба. Пример: `{ "kind": "tokensOnCard", "perPlayer": 0.5 }`.
  - В `onEnter` задавай тот же `perPlayer` на узле раскладки — он развернётся в `count`
    по числу игроков: `{ "do": "placeEldritchToken", "perPlayer": 0.5 }`. (Литеральный
    `count` — только для фикс. числа.) Обычно множитель совпадает с целью Тайны.
- **Набор жетонов (`tokensOnCard`)** — задаётся через `progress` (массив хуков):
  `{ on, when?, test?, cost?, effect }`. Это data-driven: один и тот же финал, разные
  способы набора (встреча на жетоне/метке, закрытие врат по Омену и т.д.). Полностью —
  **`dark-omens-relay/MYSTERY-PROGRESS.md`**.
- `progressHook` (один объект) — легаси-форма; новый формат — `progress: [ … ]`.
  Триггеры: `encounterAtEldritchToken` · `encounterAtMysteryToken` · `gateClosed` ·
  `monsterDefeated` · `researchEncounterResolved`.

### mythos
```json
{ "onReveal": [ { "do": "advanceDoom", "amount": 1 } ], "ongoing": [] }
```
Маппинг в колоду: `onReveal → onDraw`, `ongoing → whileInPlay`. Цвет берётся из `kind`/тега
`color:`; кол-во по акту задаёт **рецепт Древнего** (`mythosDeck.byAct`).

### ancient (Древний) — рецепт кампании
ID карточки = **slug** Древнего (по нему ссылаются `ancient:<slug>`).
```json
{
  "doomClock": 14,
  "mysteryLocations": { "byAct": { "1": ["Arkham","8"], "2": [...], "3": [...] } },
  "mythosDeck": { "byAct": {
    "1": { "green": 2, "yellow": 1, "blue": 1 },
    "2": { "green": 2, "yellow": 2, "blue": 1 },
    "3": { "green": 3, "yellow": 2, "blue": 1 }
  } }
}
```
- `mysteryLocations.byAct` — id локаций из `dark-omens/data/locations.json` (где раскрывается
  Тайна акта).
- `mythosDeck.byAct` — сколько карт Мифов каждого цвета на акт (тянутся из CMS `type=mythos`
  с `ancient:<slug>`).

---

## 5. Проза (`i18n[locale]`) по типам

| Тип / вид | Поля |
|---|---|
| encounter flat (general/research) | `name`, `mainText`, `successText`, `failureText` |
| encounter gate/mystery | `name`, `stage1.{mainText,successText,failureText}`, `successBranch.{…}`, `failureBranch.{…}`, `otherWorld` (gate) |
| mystery (карта) | `name`, `flavorText`, `text`, `resolution` |
| ancient | `name`, `epithet`, `description`, `awakening` |

UI-строки (меню/кнопки) — НЕ здесь, а в `dark-omens/assets/i18n/translations.csv`.

---

## 6. Effect-DSL — кратко

Эффекты в `onSuccess` / `onFailure` / `onEnter` / `progressHook.effect` / `onReveal` — массив
**узлов**:

```
узел :=
  | { "do": <verb>, "target"?, "amount"?|"count"?, "when"?, "repeat"? }   // действие
  | { "test": <skill>, "modifier"?, "onPass": [...], "onFail": [...] }    // вложенная проверка
  | { "choice": [<узел>, <узел>], "by"? }                                 // выбор игрока
  | { "dieRoll": [ { "on": "6", "then": [...] } ] }                       // бросок
  | { "group": [...] }
```

Частые `do`: `gainClue` · `loseClue` · `gainHealth`/`loseHealth` · `healSanity`/`loseSanity` ·
`improveSkill {skill}` · `gainAsset` · `gainSpell` · `placeClue` · `advanceDoom` ·
`gainCondition {condition}` · `move`. Навыки: `lore · influence · observation · strength · will`.

**Полный словарь** (все verb'ы, target'ы, `when`/`repeat`/`cost`/`limit`, примеры) —
`dark-omens-relay/EFFECT-DSL.md`. Что движок ещё не исполняет — пиши `{ "do": "text", "text": "…" }`
(показывается игроку, не применяется).
