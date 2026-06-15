import { useEffect, useState, type CSSProperties } from 'react';
import { listContent, type Meta } from '@/lib/api';
import type { ContentRecord, ContentListItem } from '@/lib/types';
import { splitTags, matchAxes } from '@/lib/match';

// Расчёт-модалка для встречи: где выпадает (оси), доля в пуле контекста, шанс
// успеха по размеру пула кубов. Всё считается тут (данные из /meta + списка).
//
// Кубы Dark Omens: d6, успех = грань ≥5 (по умолч. 1/3), проверка пройдена при
// ≥1 успехе. Blessed → ≥4 (1/2), Cursed → только 6 (1/6).

const passProb = (pool: number, perDie: number): number =>
  pool <= 0 ? 0 : 1 - Math.pow(1 - perDie, pool);

const pct = (x: number): string => `${Math.round(x * 100)}%`;

// Совместимы ли оси двух карт (могут ли попасть в один контекст): равны ИЛИ хотя бы
// одна пуста (вайлдкард). Пустую строку трактуем как «без ограничения».
const axisCompat = (a: string, b: string): boolean => a === '' || b === '' || a === b;

function collectTests(rec: ContentRecord): { label: string; skill: string; modifier: number }[] {
  const d = rec.data as Record<string, unknown>;
  const out: { label: string; skill: string; modifier: number }[] = [];
  const push = (label: string, container: unknown) => {
    const t = (container as { test?: { skill?: string; modifier?: number } } | undefined)?.test;
    if (t?.skill) out.push({ label, skill: String(t.skill), modifier: Number(t.modifier ?? 0) });
  };
  if (rec.kind === 'gate' || rec.kind === 'mystery') {
    push('Стадия 1', d.stage1);
    push('Ветка успеха', d.successBranch);
    push('Ветка провала', d.failureBranch);
  } else {
    push('Проверка', d); // general/research: test в корне data
  }
  return out;
}

const POOLS = [1, 2, 3, 4, 5, 6, 7, 8];

export function EncounterAnalysis(
  { rec, meta, onClose }: { rec: ContentRecord; meta: Meta | undefined; onClose: () => void },
) {
  const m = splitTags(rec.tags);
  const axes = matchAxes(rec.type, rec.kind);
  const [pool, setPool] = useState<ContentListItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    listContent({ type: 'encounter', kind: rec.kind, status: 'published' })
      .then((r) => { if (alive) setPool(r.items); })
      .catch(() => { if (alive) setPool([]); });
    return () => { alive = false; };
  }, [rec.kind]);

  // ── Контекст ──
  const locName = (id: string) => meta?.locations.find((l) => l.id === id)?.name ?? id;
  const ancName = (id: string) =>
    id === 'any' ? 'любой' : (meta?.ancients.find((a) => a.id === id)?.name ?? id);
  const ctx: string[] = [`Вид: ${rec.kind}`];
  if (axes.location && m.location) ctx.push(`Только на клетке: ${locName(m.location)}`);
  else if (axes.loc) ctx.push(`Тип локации: ${m.loc || 'любой'}`);
  if (axes.world) ctx.push(`Иной мир: ${m.world || 'любой'}`);
  if (axes.act && m.act) ctx.push(`Акт (стадия кампании): ${m.act}`);
  ctx.push(`Древний: ${m.ancient ? ancName(m.ancient) : 'любой (общая)'}`);

  // ── Шанс вытяжки: пул карт в том же тире, что пересекаются по контексту ──
  const isPinned = m.location !== '';
  const ancSpecific = m.ancient !== '' && m.ancient !== 'any';
  let drawNote = 'Загрузка…';
  if (pool) {
    const competitors = pool.filter((c) => {
      const cm = splitTags(c.tags);
      const cPinned = cm.location !== '';
      if (isPinned ? cm.location !== m.location : cPinned) return false;        // тот же site-тир
      const cAncSpec = cm.ancient !== '' && cm.ancient !== 'any';
      if (ancSpecific ? cm.ancient !== m.ancient : cAncSpec) return false;      // тот же ancient-тир
      return axisCompat(m.loc, cm.loc) && axisCompat(m.act, cm.act) && axisCompat(m.world, cm.world);
    });
    const n = Math.max(1, competitors.length); // включая саму карту
    const tier = isPinned ? 'локационном' : ancSpecific ? 'специфичном Древнему' : 'общем';
    drawNote = `В ${tier} тире этого контекста — ${n} карт(ы) → доля ~${pct(1 / n)} за вытяжку.`;
  }

  const tests = collectTests(rec);

  const box: CSSProperties = {
    background: '#14111f', border: '1px solid #3d2e10', borderRadius: 8,
    padding: 24, maxWidth: 640, width: '90%', maxHeight: '85vh', overflow: 'auto',
    color: '#d4cfc0', fontSize: 14, lineHeight: 1.5,
  };
  const head: CSSProperties = { color: '#c7a84a', marginTop: 18, marginBottom: 6 };
  const hint: CSSProperties = { color: '#7a7060', fontSize: 12, marginTop: 4 };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={box}>
        <h3 style={{ color: '#c7a84a', marginTop: 0 }}>📊 Анализ встречи</h3>

        <h4 style={head}>Когда выпадает</h4>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{ctx.map((c) => <li key={c}>{c}</li>)}</ul>

        <h4 style={head}>Шанс вытяжки</h4>
        <p style={{ margin: 0 }}>{drawNote}</p>
        <p style={hint}>
          Доля ВНУТРИ контекста; реальная частота зависит от того, как часто игрок
          попадает на подходящую клетку/акт (геймплей).
        </p>

        <h4 style={head}>Шанс успеха по пулу кубов</h4>
        {tests.length === 0
          ? <p style={{ margin: 0 }}>Проверка не задана в механике.</p>
          : tests.map((t) => (
            <p key={t.label} style={{ margin: '2px 0' }}>
              {t.label}: навык <b>{t.skill}</b>
              {t.modifier !== 0 ? `, модификатор ${t.modifier > 0 ? '+' : ''}${t.modifier}` : ''}
              {' '}→ пул = навык{t.modifier !== 0 ? ` ${t.modifier > 0 ? '+' : ''}${t.modifier}` : ''}
            </p>
          ))}
        <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', textAlign: 'center' }}>
          <thead>
            <tr style={{ color: '#7a7060' }}>
              <th style={{ textAlign: 'left' }}>Пул кубов</th>
              {POOLS.map((p) => <th key={p}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'left' }}>Норма (5–6)</td>
              {POOLS.map((p) => <td key={p}>{pct(passProb(p, 1 / 3))}</td>)}
            </tr>
            <tr style={{ color: '#4db870' }}>
              <td style={{ textAlign: 'left' }}>Благословлён (4–6)</td>
              {POOLS.map((p) => <td key={p}>{pct(passProb(p, 1 / 2))}</td>)}
            </tr>
            <tr style={{ color: '#c4756a' }}>
              <td style={{ textAlign: 'left' }}>Проклят (6)</td>
              {POOLS.map((p) => <td key={p}>{pct(passProb(p, 1 / 6))}</td>)}
            </tr>
          </tbody>
        </table>
        <p style={hint}>
          d6, пройдено при ≥1 успехе. Пул = навык сыщика + модификатор проверки. Состояние
          сыщика сдвигает грань успеха: норма ≥5 (1/3), Благословлён ≥4 (1/2), Проклят =6 (1/6).
        </p>

        <div style={{ marginTop: 18, textAlign: 'right' }}>
          <button type="button" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
