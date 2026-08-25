// Оси матчинга карточки хранятся в tags с префиксами:
//   ancient:<id>   — Древний (или 'any' = общая карточка)
//   loc:<type>     — тип локации (city/wilderness/sea)
//   location:<id>  — КОНКРЕТНАЯ локация (привязка встречи к клетке); нет → любая типа loc
//   world:<name>   — Иной мир (для gate)
//   act:<n>        — акт (для research)
//   season:<id>    — сезон выпуска (ось ДОСТУПНОСТИ; есть у любого типа карточки)
// Остальные теги — свободные (тематические). Эти хелперы раскладывают tags на
// структурные оси + free и собирают обратно.

export interface MatchTags {
  ancient: string;   // '' | 'any' | <ancientId>
  loc: string;       // '' | <locationType>
  location: string;  // '' | <locationId> — конкретная локация
  world: string;     // '' | <otherWorld>
  act: string;       // '' | '1' | '2' | '3'
  season: string;    // '' (не размечено = недоступно) | <seasonId>
  free: string[];    // прочие (тематические) теги
}

export function splitTags(tags: string[]): MatchTags {
  const m: MatchTags = { ancient: '', loc: '', location: '', world: '', act: '', season: '', free: [] };
  for (const t of tags) {
    const i = t.indexOf(':');
    const pfx = i >= 0 ? t.slice(0, i) : '';
    const val = i >= 0 ? t.slice(i + 1) : '';
    if      (pfx === 'ancient')  m.ancient = val;
    else if (pfx === 'loc')      m.loc = val;
    else if (pfx === 'location') m.location = val;
    else if (pfx === 'world')    m.world = val;
    else if (pfx === 'act')      m.act = val;
    else if (pfx === 'season')   m.season = val;
    else m.free.push(t);
  }
  return m;
}

export function joinTags(m: MatchTags): string[] {
  const out: string[] = [];
  if (m.ancient)  out.push(`ancient:${m.ancient}`);
  if (m.loc)      out.push(`loc:${m.loc}`);
  if (m.location) out.push(`location:${m.location}`);
  if (m.world)    out.push(`world:${m.world}`);
  if (m.act)      out.push(`act:${m.act}`);
  if (m.season)   out.push(`season:${m.season}`);
  out.push(...m.free);
  return out;
}

/** Какие оси матчинга показывать под тип+вид.
 *  Сезон сюда НЕ входит: он есть у карточки любого типа и живёт в редакторе
 *  рядом со статусом — это ось доступности, а не контекста выборки. */
export function matchAxes(
  type: string, kind: string,
): { ancient: boolean; loc: boolean; location: boolean; world: boolean; act: boolean } {
  if (type === 'encounter') {
    const gate = kind === 'gate';
    // location — только для не-gate встреч (general/research/mystery «на клетке»).
    return { ancient: true, loc: !gate, location: !gate, world: gate, act: kind === 'research' };
  }
  if (type === 'mythos' || type === 'mystery') {
    return { ancient: true, loc: false, location: false, world: false, act: false };
  }
  return { ancient: false, loc: false, location: false, world: false, act: false };
}
