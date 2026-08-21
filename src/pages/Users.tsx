// Страница управления доступом к игре.
//
// Пока продаж на itch нет, право выдаётся руками отсюда (source: 'manual').
// Когда появится верификатор магазина, он будет писать в ту же таблицу со своим
// source — страница продолжит работать, просто строки начнут появляться сами.

import { useMemo, useState } from 'react';

import { useUsers, useGrantAccess, useRevokeAccess } from '@/hooks';
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
  const toast = useToast();
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const all = data?.users ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  }, [data, filter]);

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

      <div className="row">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск по почте или имени"
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>Почта</th>
            <th>Имя</th>
            <th>Регистрация</th>
            <th>Доступ</th>
            <th>Источник</th>
            <th>Причина</th>
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
              <td>{u.source ?? '—'}</td>
              <td>{u.reason || '—'}</td>
              <td className="text-right whitespace-nowrap">
                {u.status === 'active' ? (
                  <button className="danger" onClick={() => void onRevoke(u)}>Отозвать</button>
                ) : (
                  <button className="primary" onClick={() => void onGrant(u)}>Выдать</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7}>Никого не нашлось.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
