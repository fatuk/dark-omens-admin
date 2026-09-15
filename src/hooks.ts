// Слой данных на React Query поверх функций lib/api. Запросы кэшируются, мутации
// инвалидируют список после save/delete.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMeta, listContent, getContent,
  createContent, updateContent, deleteContent,
  draftFields, translateFields,
  listUsers, grantAccess, revokeAccess, inviteUser,
  listGames, getGameDetails, generateChronicle, saveChronicleStory, setChroniclePublished, deleteGame,
  type Meta,
} from '@/lib/api';
import type { ContentListItem, ContentRecord } from '@/lib/types';

export interface ListFilters {
  type?: string; kind?: string; status?: string; tag?: string;
  ancient?: string; loc?: string; world?: string; act?: string; season?: string;
}

const keys = {
  meta: ['meta'] as const,
  list: (f: ListFilters) => ['content', 'list', f] as const,
  item: (id: string) => ['content', 'item', id] as const,
  users: ['users'] as const,
  games: ['games'] as const,
  game: (id: string) => ['games', id] as const,
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

/**
 * Переключить служебный флаг `data.hasImage` прямо из списка.
 *
 * PUT на бэке ЗАМЕНЯЕТ запись целиком, поэтому сначала тянем карточку и
 * отправляем её обратно с одним изменённым полем — иначе снесли бы механику и
 * тексты. Правку показываем сразу (оптимистично) во всех кэшах списка: 591
 * строка перезапрашивается заметно, а чекбокс должен щёлкать мгновенно.
 */
export function useSetHasImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; value: boolean }) => {
      const rec = await getContent(v.id);
      return updateContent(v.id, { ...rec, data: { ...rec.data, hasImage: v.value } });
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['content', 'list'] });
      const prev = qc.getQueriesData({ queryKey: ['content', 'list'] });
      qc.setQueriesData<{ items: ContentListItem[] }>({ queryKey: ['content', 'list'] }, (old) =>
        old
          ? { ...old, items: old.items.map((it) => (it.id === v.id ? { ...it, hasImage: v.value } : it)) }
          : old,
      );
      return { prev };
    },
    // Не удалось сохранить — возвращаем как было, иначе галка врёт про сервер.
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.prev ?? []) qc.setQueryData(key, data);
    },
    onSettled: (saved) => {
      if (saved) qc.setQueryData(keys.item(saved.id), saved);
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

// ── Доступ к игре ─────────────────────────────────────────────────────────────
// Мутации инвалидируют список: статус права меняется прямо в таблице, и без
// этого строка осталась бы со старым значением до перезагрузки страницы.

export function useUsers() {
  return useQuery({ queryKey: keys.users, queryFn: listUsers });
}

export function useGrantAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; reason?: string; product?: string }) =>
      grantAccess(v.email, v.reason, v.product),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; name?: string; reason?: string }) =>
      inviteUser(v.email, v.name, v.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useRevokeAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; reason?: string; product?: string }) =>
      revokeAccess(v.email, v.reason, v.product),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users }),
  });
}

// ── Хроники партий ────────────────────────────────────────────────────────────

export function useGames() {
  return useQuery({ queryKey: keys.games, queryFn: listGames });
}

export function useGame(id: string | undefined) {
  return useQuery({
    queryKey: keys.game(id ?? ''),
    queryFn: () => getGameDetails(id!),
    enabled: Boolean(id),
  });
}

function useGameMutation<A, R>(fn: (a: A) => Promise<R>, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.game(id) });
      void qc.invalidateQueries({ queryKey: keys.games });
    },
  });
}

export function useGenerateChronicle(id: string) {
  return useGameMutation((_: void) => generateChronicle(id), id);
}
export function useSaveStory(id: string) {
  return useGameMutation((story: Parameters<typeof saveChronicleStory>[1]) => saveChronicleStory(id, story), id);
}
export function useSetPublished(id: string) {
  return useGameMutation((published: boolean) => setChroniclePublished(id, published), id);
}
export function useDeleteGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGame(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.games }),
  });
}
