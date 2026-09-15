// Страница партии: шапка, лента событий, история — генерация, правка, публикация.
//
// Генерация — только руками отсюда (ручной режим): каждый вызов перезаписывает
// историю и снимает её с публикации, чтобы на лендинг не ушло непрочитанное.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useGame, useGenerateChronicle, useSaveStory, useSetPublished } from '@/hooks';
import { useToast } from '@/components/toast';
import type { GameEvent, Story } from '@/lib/api';
import { outcomeLabel } from './Games';

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

function EventLine({ e }: { e: GameEvent }) {
  const params = Object.entries(e.params).map(([k, v]) => `${k}=${String(v)}`).join(' ');
  return (
    <tr>
      <td className="whitespace-nowrap hint">{fmtTime(e.ts)}</td>
      <td>{e.round}</td>
      <td className="hint">{e.phase}</td>
      <td>{e.kind === 'milestone' ? <span className="badge">веха</span> : null} {e.eventId}</td>
      <td>{e.investigator}</td>
      <td className="hint">{params}</td>
    </tr>
  );
}

function StoryEditor({
  story, onChange,
}: { story: Story; onChange: (s: Story) => void }) {
  const set = (patch: Partial<Story>) => onChange({ ...story, ...patch });
  const setChapter = (i: number, patch: Partial<Story['chapters'][number]>) => {
    const chapters = story.chapters.map((ch, j) => (j === i ? { ...ch, ...patch } : ch));
    onChange({ ...story, chapters });
  };
  return (
    <div>
      <div className="field">
        <label>Заголовок</label>
        <input value={story.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="field">
        <label>Подзаголовок</label>
        <input value={story.tagline} onChange={(e) => set({ tagline: e.target.value })} />
      </div>
      <div className="field">
        <label>Пролог</label>
        <textarea value={story.prologue} onChange={(e) => set({ prologue: e.target.value })} rows={5} />
      </div>
      {story.chapters.map((ch, i) => (
        <div className="prose-group" key={i}>
          <div className="prose-group-title">Глава {i + 1} · раунды {ch.rounds[0]}–{ch.rounds[1]}</div>
          <div className="field">
            <input value={ch.title} onChange={(e) => setChapter(i, { title: e.target.value })} placeholder="название главы" />
          </div>
          <div className="field">
            <textarea value={ch.text} onChange={(e) => setChapter(i, { text: e.target.value })} rows={8} />
          </div>
        </div>
      ))}
      <div className="field">
        <label>Эпилог</label>
        <textarea value={story.epilogue} onChange={(e) => set({ epilogue: e.target.value })} rows={5} />
      </div>
      <div className="prose-group">
        <div className="prose-group-title">Судьбы сыщиков</div>
        {story.cast.map((c, i) => (
          <div className="field row" key={c.key}>
            <span className="whitespace-nowrap" style={{ minWidth: 160 }}>{c.name}</span>
            <input
              value={c.fate}
              onChange={(e) => {
                const cast = story.cast.map((x, j) => (j === i ? { ...x, fate: e.target.value } : x));
                onChange({ ...story, cast });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GamePage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useGame(id);
  const gen = useGenerateChronicle(id);
  const save = useSaveStory(id);
  const publish = useSetPublished(id);
  const toast = useToast();
  const [draft, setDraft] = useState<Story | null>(null);
  const [showEvents, setShowEvents] = useState(false);

  // Локальная копия истории для правок; свежая версия с сервера её заменяет.
  useEffect(() => { setDraft(data?.chronicle?.story ?? null); }, [data?.chronicle?.updatedAt]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="container">Загрузка…</div>;
  if (error || !data) return <div className="container danger">{String((error as Error)?.message ?? 'нет данных')}</div>;

  const { game, events, chronicle } = data;
  const dirty = draft && chronicle && JSON.stringify(draft) !== JSON.stringify(chronicle.story);

  async function onGenerate() {
    if (chronicle && !confirm('Перегенерировать? Текущая история (и правки) будут заменены, публикация снята.')) return;
    try {
      await gen.mutateAsync();
      toast.success('История сгенерирована');
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  async function onSave() {
    if (!draft) return;
    try {
      await save.mutateAsync(draft);
      toast.success('Сохранено');
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  async function onPublish(on: boolean) {
    if (dirty && !confirm('Есть несохранённые правки — они не попадут на лендинг. Продолжить?')) return;
    try {
      await publish.mutateAsync(on);
      toast.success(on ? 'Опубликовано' : 'Снято с публикации');
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  return (
    <div className="container">
      <div className="row">
        <Link to="/games">← Партии</Link>
      </div>
      <h2>{game.roomName || game.id.slice(0, 8)} <span className="hint">{game.lang}</span></h2>

      <div className="section">
        <div className="section-title">Партия</div>
        <div>Древний: <b>{game.ancient || '—'}</b> · раундов: {game.rounds} · исход: <b>{outcomeLabel(game.outcome)}</b></div>
        <div>Сыщики: {game.roster.map((r) => `${r.investigator}${r.dead ? ' †' : ''}`).join(', ') || '—'}</div>
        <div className="hint">{new Date(game.startedAt).toLocaleString()} → {game.endedAt ? new Date(game.endedAt).toLocaleString() : 'идёт'} · событий: {events.length}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => setShowEvents((v) => !v)}>{showEvents ? 'Скрыть ленту' : 'Показать ленту'}</button>
          <button className="primary" onClick={() => void onGenerate()} disabled={gen.isPending || events.length === 0}>
            {gen.isPending ? 'Пишем…' : chronicle ? 'Перегенерировать историю' : 'Сгенерировать историю'}
          </button>
        </div>
        {events.length === 0 && <div className="hint">У партии нет событий — генерировать нечего.</div>}
      </div>

      {showEvents && (
        <div className="section">
          <div className="section-title">Лента событий</div>
          <table>
            <thead><tr><th>Время</th><th>Раунд</th><th>Фаза</th><th>Событие</th><th>Сыщик</th><th>Параметры</th></tr></thead>
            <tbody>{events.map((e) => <EventLine key={e.seq} e={e} />)}</tbody>
          </table>
        </div>
      )}

      {chronicle && draft && (
        <div className="section">
          <div className="section-title">
            История · {chronicle.status === 'published' ? <span className="badge published">опубликована</span> : <span className="badge">черновик</span>}
            {chronicle.status === 'published' && (
              <span className="hint"> · /chronicle.html?s={chronicle.slug}</span>
            )}
          </div>
          <StoryEditor story={draft} onChange={setDraft} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => void onSave()} disabled={!dirty || save.isPending}>Сохранить правки</button>
            {chronicle.status === 'published'
              ? <button className="danger" onClick={() => void onPublish(false)} disabled={publish.isPending}>Снять с публикации</button>
              : <button className="primary" onClick={() => void onPublish(true)} disabled={publish.isPending}>Опубликовать</button>}
          </div>
        </div>
      )}
    </div>
  );
}
