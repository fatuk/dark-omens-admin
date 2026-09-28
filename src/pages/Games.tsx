// Список партий из хроники реле. Отсюда — в партию: события, генерация истории,
// правка и публикация на лендинг.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useGames, useDeleteGame } from '@/hooks';
import { fuzzyFilter } from '@/lib/fuzzy';
import { useToast } from '@/components/toast';
import type { GameSummary } from '@/lib/api';

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

export function outcomeLabel(o: string): string {
  switch (o) {
    case 'victory': return 'победа';
    case 'defeat': return 'поражение';
    case 'abandoned': return 'брошена';
    default: return 'идёт';
  }
}

function OutcomeBadge({ o }: { o: string }) {
  if (o === 'victory') return <span className="badge published">победа</span>;
  if (o === 'defeat') return <span className="badge danger">поражение</span>;
  if (o === 'abandoned') return <span className="badge">брошена</span>;
  return <span className="badge">идёт</span>;
}

function ChronicleBadge({ g }: { g: GameSummary }) {
  if (g.chronicle === 'published') return <span className="badge published">опубликована</span>;
  if (g.chronicle === 'draft') return <span className="badge">черновик</span>;
  return <span className="hint">нет</span>;
}

export function GamesPage() {
  const { data, isLoading, error } = useGames();
  const del = useDeleteGame();
  const toast = useToast();
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const all = data?.games ?? [];
    return fuzzyFilter(all, filter, (g) => [
      g.roomName, g.ancient, g.outcome, ...g.roster.map((r) => r.investigator),
    ]);
  }, [data, filter]);

  // Подтверждение вводом первых символов id: удаление необратимо (события и
  // хроника уходят вместе с партией).
  async function onDelete(g: GameSummary) {
    const short = g.id.slice(0, 8);
    const typed = window.prompt(
      `Удаление необратимо: партия «${g.roomName || short}» будет удалена вместе с событиями и историей.\n`
      + `Введите первые 8 символов id для подтверждения:\n${short}`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== short.toLowerCase()) {
      toast.error('Подтверждение не совпало, удаление отменено');
      return;
    }
    try {
      await del.mutateAsync(g.id);
      toast.success('Партия удалена');
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  if (isLoading) return <div className="container">Загрузка…</div>;
  if (error) return <div className="container danger">{String((error as Error).message)}</div>;

  return (
    <div className="container">
      <h2>Хроники партий</h2>
      <div className="hint">
        Реле записывает каждую партию: состав, Древнего, ленту действий и вехи. История
        генерируется вручную со страницы партии, там же правится и публикуется на лендинг.
      </div>

      <div className="row">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск: комната, Древний, сыщик, исход"
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>Начало</th>
            <th>Комната</th>
            <th>Древний</th>
            <th>Сыщики</th>
            <th>Раундов</th>
            <th>Событий</th>
            <th>Исход</th>
            <th>История</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td className="whitespace-nowrap">{fmtDate(g.startedAt)}</td>
              <td><Link to={`/games/${g.id}`}>{g.roomName || g.id.slice(0, 8)}</Link> <span className="hint">{g.lang}</span></td>
              <td>{g.ancient || '—'}</td>
              <td>{g.roster.map((r) => r.investigator).filter(Boolean).join(', ') || '—'}</td>
              <td>{g.rounds}</td>
              <td>{g.events}</td>
              <td><OutcomeBadge o={g.outcome} /></td>
              <td><ChronicleBadge g={g} /></td>
              <td className="text-right whitespace-nowrap">
                <Link to={`/games/${g.id}`}><button className="primary">Открыть</button></Link>{' '}
                <button className="danger" onClick={() => void onDelete(g)}>Удалить</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9}>Партий пока нет — они появятся после первой игры через реле.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
