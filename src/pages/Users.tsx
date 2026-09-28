// Страница управления доступом к игре.
//
// Пока продаж на itch нет, право выдаётся руками отсюда (source: 'manual').
// Когда появится верификатор магазина, он будет писать в ту же таблицу со своим
// source — страница продолжит работать, просто строки начнут появляться сами.

import { useMemo, useState } from 'react';

import { useUsers, useGrantAccess, useRevokeAccess, useInviteUser, useDeleteUser } from '@/hooks';
import { fuzzyFilter } from '@/lib/fuzzy';
import { SortableTh, sortRows, useTableSort } from '@/components/sortable-th';
import { useToast } from '@/components/toast';
import type { UserLicenseRow } from '@/lib/api';

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString();
}

function AccessBadge({ row }: { row: UserLicenseRow }) {
  if (row.status === 'active') return <span className="badge published">есть доступ</span>;
  if (row.status === 'revoked') return <span className="badge danger">отозван</span>;
  return <span className="badge">нет записи</span>;
}

export function UsersPage() {
  const { data, isLoading, error } = useUsers();
  const grant = useGrantAccess();
  const revoke = useRevokeAccess();
  const invite = useInviteUser();
  const del = useDeleteUser();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  const { sort, toggle } = useTableSort('doa_users_sort');

  const rows = useMemo(() => {
    const all = data?.users ?? [];
    // Нечёткий поиск: почта и имя пишутся по-разному («i.petrov@», «Иван П.»),
    // и точное вхождение промахивается чаще, чем хотелось бы.
    const found = fuzzyFilter(all, filter, (u) => [u.email, u.name, u.source, u.reason]);
    return sortRows(found, sort, (u, key) => {
      if (key === 'seasons') return (u.seasons ?? []).length;
      if (key === 'access') return u.status ?? '';
      return (u as unknown as Record<string, unknown>)[key];
    });
  }, [data, filter, sort]);

  async function onGrant(u: UserLicenseRow) {
    try {
      await grant.mutateAsync({ email: u.email });
      toast.success(`Доступ выдан: ${u.email}`);
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  async function onRevoke(u: UserLicenseRow) {
    // Отзыв рвёт живую сессию игрока — подтверждаем, чтобы не сделать этого мимо кассы.
    if (!confirm(`Отозвать доступ у ${u.email}? Его текущая сессия будет прервана.`)) return;
    const reason = prompt('Причина (попадёт в историю права):', '') ?? '';
    try {
      await revoke.mutateAsync({ email: u.email, reason });
      toast.success(`Доступ отозван: ${u.email}`);
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  // Удаление — для мусорных регистраций (опечатка в почте, тестовая учётка).
  // Необратимо: учётка, сессии и права уходят разом, живая игра игрока рвётся.
  // Подтверждение вводом, а не одним «ОК»: случайный клик по «Удалить» в
  // таблице стоит слишком дорого.
  async function onDelete(u: UserLicenseRow) {
    const typed = window.prompt(
      `Удаление необратимо: учётка, сессии и права будут удалены, текущая игра прервана.\n`
      + `Введите email игрока для подтверждения:\n${u.email}`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== u.email.toLowerCase()) {
      toast.error('Подтверждение не совпало, удаление отменено');
      return;
    }
    try {
      const r = await del.mutateAsync({ email: u.email });
      toast.success(`Удалён: ${u.email} (сессий ${r.deleted.sessions}, прав ${r.deleted.licenses})`);
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  async function onToggleSeason(u: UserLicenseRow, product: string, owned: boolean) {
    // Отзыв сезона сессию НЕ рвёт (в отличие от базы), поэтому и подтверждения
    // не спрашиваем: цена ошибки — один клик обратно.
    try {
      if (owned) await revoke.mutateAsync({ email: u.email, product, reason: 'сезон снят вручную' });
      else await grant.mutateAsync({ email: u.email, product });
      toast.success(`${owned ? 'Снят' : 'Выдан'} сезон ${product}: ${u.email}`);
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  // Игрок, которого ещё не было: заводим по почте и сразу даём доступ — он
  // запросит код на эту почту и войдёт в игру без нашего участия.
  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    try {
      const r = await invite.mutateAsync({ email, name: inviteName.trim() });
      toast.success(r.created ? `Добавлен: ${r.user.email}` : `Уже есть, доступ выдан: ${r.user.email}`);
      setInviteEmail('');
      setInviteName('');
    } catch (err) {
      toast.error(String((err as Error).message));
    }
  }

  if (isLoading) return <div className="container">Загрузка…</div>;
  if (error) return <div className="container danger">{String((error as Error).message)}</div>;

  return (
    <div className="container">
      <h2>Доступ к игре</h2>

      {!data?.enforced && (
        <div className="section">
          <div className="section-title">Принуждение выключено</div>
          Сейчас в игру пускают всех независимо от прав: на relay не задан
          <code> LICENSE_ENFORCE=1</code>. Выдавать доступ можно заранее, но
          действовать он начнёт только после включения.
        </div>
      )}

      <form className="section" onSubmit={(e) => void onInvite(e)}>
        <div className="section-title">Добавить игрока</div>
        <div className="row">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="почта игрока"
          />
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="имя (необязательно — возьмём с первого входа)"
            maxLength={32}
          />
          <button className="primary" type="submit" disabled={invite.isPending}>
            Добавить и выдать доступ
          </button>
        </div>
        <div className="hint">
          Игрок запрашивает код на эту почту в игре и входит сразу — регистрироваться заранее ему не нужно.
        </div>
      </form>

      <div className="row">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск по почте или имени — можно обрывками"
        />
      </div>

      <table>
        <thead>
          <tr>
            <SortableTh label="Почта" sortKey="email" sort={sort} onSort={toggle} />
            <SortableTh label="Имя" sortKey="name" sort={sort} onSort={toggle} />
            <SortableTh label="Регистрация" sortKey="createdAt" sort={sort} onSort={toggle} />
            <SortableTh label="Доступ" sortKey="access" sort={sort} onSort={toggle} />
            <SortableTh
              label="Сезоны" sortKey="seasons" sort={sort} onSort={toggle}
              title="Сортировать по ЧИСЛУ сезонов; третий клик — снять сортировку"
            />
            <SortableTh label="Источник" sortKey="source" sort={sort} onSort={toggle} />
            <SortableTh label="Причина" sortKey="reason" sort={sort} onSort={toggle} />
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.name}</td>
              <td>{fmtDate(u.createdAt)}</td>
              <td><AccessBadge row={u} /></td>
              <td>
                {/* Сезоны независимы от базы: право на сезон НЕ даёт права на
                    игру, поэтому переключаются отдельно от кнопки доступа. */}
                <div className="flex flex-wrap gap-1 w-[250px]">
                  {(data?.seasons ?? []).map((s) => {
                    const owned = u.seasons?.includes(s.id) ?? false;
                    return (
                      <button
                        key={s.id}
                        className={`chip-btn${owned ? ' primary' : ''}`}
                        title={s.name}
                        onClick={() => void onToggleSeason(u, s.id, owned)}
                      >
                        {s.id}
                      </button>
                    );
                  })}
                </div>
              </td>
              <td>{u.source ?? '—'}</td>
              <td>{u.reason || '—'}</td>
              <td className="text-right whitespace-nowrap">
                {u.status === 'active' ? (
                  <button className="danger" onClick={() => void onRevoke(u)}>Отозвать</button>
                ) : (
                  <button className="primary" onClick={() => void onGrant(u)}>Выдать</button>
                )}
                <button
                  className="ml-2"
                  title="Удалить учётку вместе с сессиями и правами"
                  onClick={() => void onDelete(u)}
                >
                  Удалить
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8}>Никого не нашлось.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
