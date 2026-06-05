// Слой данных на React Query поверх функций lib/api. Запросы кэшируются, мутации
// инвалидируют список после save/delete.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMeta, listContent, getContent,
  createContent, updateContent, deleteContent,
  draftFields, translateFields,
  type Meta,
} from '@/lib/api';
import type { ContentRecord } from '@/lib/types';

export interface ListFilters {
  type?: string; kind?: string; status?: string; tag?: string;
  ancient?: string; loc?: string; world?: string; act?: string;
}

const keys = {
  meta: ['meta'] as const,
  list: (f: ListFilters) => ['content', 'list', f] as const,
  item: (id: string) => ['content', 'item', id] as const,
};

// Справочники для селектов — кэшируем надолго, не критичны (retry: false).
export function useMeta() {
  return useQuery<Meta>({ queryKey: keys.meta, queryFn: getMeta, staleTime: 5 * 60_000 });
}

export function useContentList(filters: ListFilters) {
  return useQuery({ queryKey: keys.list(filters), queryFn: () => listContent(filters) });
}

export function useContent(id: string, enabled: boolean) {
  return useQuery({ queryKey: keys.item(id), queryFn: () => getContent(id), enabled });
}

export function useSaveContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; isNew: boolean; rec: Partial<ContentRecord> }) =>
      v.isNew ? createContent(v.rec) : updateContent(v.id, v.rec),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['content', 'list'] });
      qc.setQueryData(keys.item(saved.id), saved);
    },
  });
}

export function useDeleteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteContent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', 'list'] }),
  });
}

// LLM — без кэша/инвалидации: просто RPC, результат вливается в форму вызывающим.
export function useDraft() {
  return useMutation({ mutationFn: draftFields });
}
export function useTranslate() {
  return useMutation({ mutationFn: translateFields });
}
