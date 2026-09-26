import type { Meta } from '@/lib/api';

/** Вариант ref-селекта: голый id или id с подписью (артефакт «Ключ к Каркозе»). */
export type RefOption = string | { id: string; label: string };

/** Справочники для ref-параметров Effect-DSL (ключ — RefKind из verb-манифеста
 *  relay). Один источник на все формы: добавил ref в манифест — добавь его сюда. */
export function refOptionsFrom(meta: Meta | undefined, skills?: string[]): Record<string, RefOption[]> {
  return {
    condition:     meta?.dsl?.conditions ?? [],
    conditionKind: meta?.dsl?.conditionKinds ?? [],
    skill:         skills ?? meta?.dsl?.skills ?? [],
    assetTrait:    meta?.dsl?.traits?.asset ?? [],
    spellTrait:    meta?.dsl?.traits?.spell ?? [],
    artifactTrait: meta?.dsl?.traits?.artifact ?? [],
    artifact:      (meta?.artifacts ?? []).map((a) => ({ id: a.id, label: a.name })),
    location:      (meta?.locations ?? []).map((l) => ({ id: l.id, label: l.name })),
  };
}

export function refOptionId(o: RefOption): string { return typeof o === 'string' ? o : o.id; }
export function refOptionLabel(o: RefOption): string { return typeof o === 'string' ? o : o.label; }
