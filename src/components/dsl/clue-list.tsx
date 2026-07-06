// Редактор улик Древнего: массив data.clues[]. Ключ улики — ЛОКАЦИЯ (у локаций уже
// есть id; отдельный id не заводим). Картинка в игре ищется по id локации
// (res://assets/cards/clue/<Id>.png, как арт ассета) — в админке не грузим.
//
// Интерфейс как у прозы карточки: табы языка EN/RU (общие на список), на каждую
// улику — генерация LLM (по имени локации + общий brief) и перевод активной локали
// в другую. Текст (title/description) живёт по локалям внутри самой улики.
import { useState } from 'react';
import { LOCALES, type Locale } from '@/lib/types';
import { AutoTextarea } from '@/components/auto-textarea';
import { useDraft, useTranslate } from '@/hooks';
import { useToast } from '@/components/toast';

type LocText = Record<string, string>;
export type Clue = { location: string; title: LocText; description: LocText };
type LocMeta = { id: string; name: string };

type Props = {
  value: Clue[];
  onChange: (c: Clue[]) => void;
  locations?: LocMeta[];
};

const STRUCT = 'rounded border border-white/10 p-2 flex flex-col gap-1.5';
const HEAD = 'flex items-center gap-2 text-xs uppercase tracking-wide opacity-70';

export function ClueList({ value, onChange, locations }: Props): JSX.Element {
  const clues = value ?? [];
  const locs = locations ?? [];
  const [loc, setLoc] = useState<Locale>('ru');
  const [brief, setBrief] = useState('');
  const draftMut = useDraft();
  const translateMut = useTranslate();
  const toast = useToast();
  const busy = draftMut.isPending || translateMut.isPending;

  const setClue = (i: number, c: Clue): void => onChange(clues.map((x, j) => (j === i ? c : x)));
  const patch = (i: number, p: Partial<Clue>): void => setClue(i, { ...clues[i], ...p });
  const setText = (i: number, field: 'title' | 'description', l: string, val: string): void =>
    patch(i, { [field]: { ...clues[i][field], [l]: val } } as Partial<Clue>);
  const remove = (i: number): void => onChange(clues.filter((_, j) => j !== i));
  const add = (): void => onChange([...clues, { location: '', title: {}, description: {} }]);

  const locName = (id: string): string => locs.find((l) => l.id === id)?.name || id || '—';
  const other: Locale = loc === 'en' ? 'ru' : 'en';
  // Локации, уже занятые уликами (одна улика на локацию). Для селекта улики i
  // показываем свободные + её собственную.
  const used = new Set(clues.map((c) => c.location).filter(Boolean));
  const optionsFor = (own: string): LocMeta[] => locs.filter((l) => l.id === own || !used.has(l.id));

  // LLM-рыба для одной улики: заголовок + описание на активном языке. Фрейминг
  // «улика на локации X» + общий brief уходят в НАПРАВЛЕНИЕ автора (draft-эндпоинт).
  async function gen(i: number): Promise<void> {
    const c = clues[i];
    if (!c.location) { toast.error('Сначала выбери локацию улики'); return; }
    const framed =
      `Улика (clue), которую сыщик находит на локации «${locName(c.location)}». ` +
      'Заголовок — короткое название находки; описание — атмосферный флейвор того, ' +
      `что обнаружено.${brief.trim() ? ` ${brief.trim()}` : ''}`;
    try {
      const { fields } = await draftMut.mutateAsync({
        type: 'ancient', kind: '', tags: ['clue', `location:${c.location}`],
        fields: ['title', 'description'], language: loc, brief: framed,
      });
      patch(i, {
        title: { ...c.title, [loc]: String(fields['title'] ?? c.title?.[loc] ?? '') },
        description: { ...c.description, [loc]: String(fields['description'] ?? c.description?.[loc] ?? '') },
      });
    } catch (e) { toast.error((e as Error).message); }
  }

  // Перевод активной локали → другую (по одной улике).
  async function tr(i: number): Promise<void> {
    const c = clues[i];
    const src: Record<string, string> = {};
    if ((c.title?.[loc] ?? '').trim()) src['title'] = c.title[loc];
    if ((c.description?.[loc] ?? '').trim()) src['description'] = c.description[loc];
    if (Object.keys(src).length === 0) {
      toast.error(`Локаль ${loc.toUpperCase()} у улики пуста — заполни сначала`); return;
    }
    try {
      const { fields } = await translateMut.mutateAsync({ fields: src, from: loc, to: other });
      patch(i, {
        title: { ...c.title, [other]: String(fields['title'] ?? c.title?.[other] ?? '') },
        description: { ...c.description, [other]: String(fields['description'] ?? c.description?.[other] ?? '') },
      });
      setLoc(other);
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="tabs">
        {LOCALES.map((l) => (
          <button key={l} type="button" className={l === loc ? 'active' : ''} onClick={() => setLoc(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="field">
        <label>Подсказка для рыбы (опц.) — тема/тон; имя локации подставляется само</label>
        <AutoTextarea value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={600}
          placeholder="напр.: обрывок дневника, упор на тревогу" className="min-h-[42px]" />
      </div>
      {clues.map((c, i) => (
        <div key={i} className={STRUCT}>
          <div className={HEAD}>
            <span className="flex-1">Улика {i + 1}</span>
            <button type="button" onClick={() => void gen(i)} disabled={busy} title="Сгенерировать текст (LLM)">
              ✨ Рыба ({loc})
            </button>
            <button type="button" onClick={() => void tr(i)} disabled={busy} title="Перевести на другой язык">
              {loc.toUpperCase()}→{other.toUpperCase()}
            </button>
            <button type="button" onClick={() => remove(i)} title="удалить">×</button>
          </div>
          <select value={c.location} title="Локация улики (её id = имя файла картинки в игре)"
            onChange={(ev) => patch(i, { location: ev.target.value })}>
            <option value="">— локация —</option>
            {optionsFor(c.location).map((l) => <option key={l.id} value={l.id}>{l.id} - {l.name}</option>)}
          </select>
          <input className="w-full" value={c.title?.[loc] ?? ''} placeholder={`Заголовок (${loc})`}
            onChange={(ev) => setText(i, 'title', loc, ev.target.value)} />
          <AutoTextarea value={c.description?.[loc] ?? ''} placeholder={`Описание (${loc})`}
            onChange={(ev) => setText(i, 'description', loc, ev.target.value)} />
        </div>
      ))}
      <button type="button" onClick={add}>+ улика</button>
    </div>
  );
}
