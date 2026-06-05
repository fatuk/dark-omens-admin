// Клиент relay admin API. База и admin-key хранятся в localStorage (вводятся в
// шапке). Все запросы шлют x-admin-key. Работает только на клиенте.

import type { ContentRecord, ContentListItem, Locale, LocaleText } from './types';

const LS_BASE = 'doa_api_base';
const LS_KEY = 'doa_admin_key';

const DEFAULT_BASE =
  (import.meta.env['VITE_API_BASE'] as string | undefined) ?? 'http://localhost:3031';

export function getApiBase(): string {
  if (typeof window === 'undefined') return DEFAULT_BASE;
  return localStorage.getItem(LS_BASE) || DEFAULT_BASE;
}
export function setApiBase(v: string): void {
  localStorage.setItem(LS_BASE, v.trim());
}
export function getAdminKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LS_KEY) || '';
}
export function setAdminKey(v: string): void {
  localStorage.setItem(LS_KEY, v.trim());
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(getApiBase() + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-admin-key': getAdminKey(),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return body as T;
}

export interface Meta {
  ancients: { id: string; name: string; epithet: string }[];
  locationTypes: string[];
  otherWorlds: string[];
  encounterKinds: string[];
  skills: string[];
  dsl?: {
    skills: string[];
    actionVerbs: string[];
    targets: string[];
    conditions: string[];
    mysteryTriggers?: string[];
    mysterySolveKinds?: string[];
  };
}

// Справочники для селектов (источник истины — движок/конфиг relay).
export function getMeta(): Promise<Meta> {
  return req(`/admin/content/meta`);
}

export function listContent(params: {
  type?: string; kind?: string; status?: string; tag?: string;
  ancient?: string; loc?: string; world?: string; act?: string;
}): Promise<{ items: ContentListItem[] }> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const qs = q.toString();
  return req(`/admin/content${qs ? '?' + qs : ''}`);
}

export function getContent(id: string): Promise<ContentRecord> {
  return req(`/admin/content/${encodeURIComponent(id)}`);
}

export function createContent(rec: Partial<ContentRecord>): Promise<ContentRecord> {
  return req(`/admin/content`, { method: 'POST', body: JSON.stringify(rec) });
}

export function updateContent(id: string, rec: Partial<ContentRecord>): Promise<ContentRecord> {
  return req(`/admin/content/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(rec) });
}

export function deleteContent(id: string): Promise<{ ok: boolean }> {
  return req(`/admin/content/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// LLM: рыба для набора полей (оригинальный текст) и перевод.
export function draftFields(input: {
  type: string; kind: string; tags: string[]; fields: string[];
  brief?: string; language: Locale;
  mechanics?: Record<string, unknown>;   // текущая механика (data) — для согласования прозы
}): Promise<{ fields: LocaleText }> {
  return req(`/admin/content/draft`, { method: 'POST', body: JSON.stringify(input) });
}

export function translateFields(input: {
  fields: LocaleText; from: Locale; to: Locale;
}): Promise<{ fields: LocaleText }> {
  return req(`/admin/content/translate`, { method: 'POST', body: JSON.stringify(input) });
}
