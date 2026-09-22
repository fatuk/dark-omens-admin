import type { Meta } from '@/lib/api';

/** Справочники для ref-параметров Effect-DSL (ключ — RefKind из verb-манифеста
 *  relay). Один источник на все формы: добавил ref в манифест — добавь его сюда. */
export function refOptionsFrom(meta: Meta | undefined, skills?: string[]): Record<string, string[]> {
  return {
    condition:     meta?.dsl?.conditions ?? [],
    skill:         skills ?? meta?.dsl?.skills ?? [],
    assetTrait:    meta?.dsl?.traits?.asset ?? [],
    spellTrait:    meta?.dsl?.traits?.spell ?? [],
    artifactTrait: meta?.dsl?.traits?.artifact ?? [],
  };
}
