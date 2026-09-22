// Визуальный конструктор плоской встречи (test + onSuccess/onFailure) на React Flow.
// Два вида одного и того же `data`: граф ↔ JSON-панель (в Edit-странице). Граф —
// источник правок для плоской формы; нераспознанные шейпы (gate/mystery) правятся
// в JSON. Словарь (навыки/verb'ы) — из /meta, чтобы не разъезжался с движком.
import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, Handle, Position,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Meta } from '@/lib/api';
import { refOptionsFrom } from '@/lib/dsl-refs';
import { Combobox } from '@/components/combobox';
import { NumField } from '@/components/num-field';
import { EffectList } from '@/components/dsl/effect-list';
import type { VerbDef } from '@/lib/api';

type Eff = Record<string, unknown>;
interface FlatData {
  test?: { skill?: string; modifier?: number };
  onSuccess?: Eff[];
  onFailure?: Eff[];
  [k: string]: unknown;
}

// Плоская встреча: объект БЕЗ ветвящихся ключей (stage1/successBranch/branches).
// test/onSuccess/onFailure могут отсутствовать — узлы отрисуются с дефолтами,
// чтобы можно было собирать встречу с нуля.
function isFlat(d: unknown): d is FlatData {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const o = d as Record<string, unknown>;
  return !('stage1' in o) && !('successBranch' in o) && !('branches' in o);
}

interface Test { skill?: string; modifier?: number }
interface Branch { test?: Test; onSuccess?: Eff[]; onFailure?: Eff[] }

// Ветвящаяся встреча (gate/mystery): двухфазное дерево — маршрут (stage1) →
// успех/провал-ветка (каждая со своей проверкой и onSuccess/onFailure).
function isBranching(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return 'stage1' in o || 'successBranch' in o || 'failureBranch' in o;
}

const DEFAULT_SKILLS = ['lore', 'influence', 'observation', 'strength', 'will'];

// ── Кастомные узлы ────────────────────────────────────────────────────────────

interface TestData extends Record<string, unknown> {
  skill: string;
  modifier: number;
  skills: string[];
  label?: string;
  hasInput?: boolean;
  onPatch: (p: Partial<{ skill: string; modifier: number }>) => void;
}

function TestNode(props: NodeProps): JSX.Element {
  const d = props.data as unknown as TestData;
  return (
    <div className="rf-node">
      {d.hasInput && <Handle type="target" position={Position.Left} />}
      <div className="rf-node-title">{d.label ?? 'Проверка'}</div>
      <div className="flex gap-1.5 items-center">
        <select
          className="nodrag"
          value={d.skill}
          onChange={(e) => d.onPatch({ skill: e.target.value })}
        >
          {d.skills.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <NumField value={d.modifier} onChange={(n) => d.onPatch({ modifier: n })} />
      </div>
      <Handle type="source" position={Position.Right} id="pass" style={{ top: 34, background: '#4db870' }} />
      <Handle type="source" position={Position.Right} id="fail" style={{ top: 58, background: '#c8643a' }} />
    </div>
  );
}

interface EffData extends Record<string, unknown> {
  title: string;
  accent: 'green' | 'red';
  effects: Eff[];
  verbs: string[];
  verbDefs?: Record<string, VerbDef>;
  targetGroups?: Record<string, string[]>;
  locations?: { id: string; name: string }[];
  targets?: string[];
  refOptions?: Record<string, string[]>;
  onEffects: (e: Eff[]) => void;
}

// Редактор исходов встречи. Использует общий EffectList (поля из verb-манифеста:
// счётчик только где есть count/amount, ref-параметры condition/skill — дропдаундом),
// чтобы не расходиться с движком (раньше был свой редактор, всегда клавший count:1).
function EffectsNode(props: NodeProps): JSX.Element {
  const d = props.data as unknown as EffData;
  return (
    <div className={`rf-node nodrag nopan ${d.accent === 'green' ? 'rf-ok' : 'rf-fail'}`}>
      <Handle type="target" position={Position.Left} />
      <div className="rf-node-title">{d.title}</div>
      <EffectList
        value={d.effects} onChange={d.onEffects} verbs={d.verbs} verbDefs={d.verbDefs}
        targetGroups={d.targetGroups} locations={d.locations} targets={d.targets}
        refOptions={d.refOptions} />
    </div>
  );
}

const nodeTypes: NodeTypes = { test: TestNode, effects: EffectsNode };

// ── Граф ──────────────────────────────────────────────────────────────────────

export function EncounterFlow(
  { value, onChange, meta }: { value: string; onChange: (json: string) => void; meta?: Meta },
): JSX.Element {
  const parsed = useMemo<unknown>(() => {
    try { return JSON.parse(value); } catch { return null; }
  }, [value]);

  const patch = useCallback(
    (next: unknown) => onChange(JSON.stringify(next, null, 2)),
    [onChange],
  );

  const skills = meta?.dsl?.skills ?? DEFAULT_SKILLS;
  // verb'ы — по алфавиту (длинный список) и стабильной ссылкой (для useMemo графа).
  const verbs = useMemo(
    () => [...(meta?.dsl?.actionVerbs ?? ['gainClue', 'loseSanity', 'loseHealth', 'placeClue'])].sort(),
    [meta],
  );

  const graph = useMemo(() => {
    // Справочники verb-манифеста для EffectList (поля/дропдауны). Внутри useMemo,
    // чтобы захватились текущим meta (в deps добавлен meta).
    const verbDefs = meta?.dsl?.verbs;
    const targetGroups = meta?.dsl?.targetGroups;
    const targets = meta?.dsl?.targets;
    const locations = meta?.locations;
    const refOptions = refOptionsFrom(meta, skills);
    const ePass = (id: string, s: string, t: string): Edge =>
      ({ id, source: s, sourceHandle: 'pass', target: t, animated: true, style: { stroke: '#4db870' } });
    const eFail = (id: string, s: string, t: string): Edge =>
      ({ id, source: s, sourceHandle: 'fail', target: t, style: { stroke: '#c8643a' } });
    const tNode = (
      id: string, x: number, y: number, label: string, hasInput: boolean,
      t: Test | undefined, onPatch: (p: Partial<Test>) => void,
    ): Node => ({
      id, type: 'test', position: { x, y }, draggable: false,
      data: { skill: t?.skill ?? skills[0], modifier: t?.modifier ?? 0, skills, label, hasInput, onPatch },
    });
    const eNode = (
      id: string, x: number, y: number, title: string, accent: 'green' | 'red',
      effects: Eff[] | undefined, onEffects: (e: Eff[]) => void,
    ): Node => ({
      id, type: 'effects', position: { x, y }, draggable: false,
      data: {
        title, accent, effects: effects ?? [], verbs,
        verbDefs, targetGroups, locations, targets, refOptions, onEffects,
      },
    });

    // Ветвящаяся (gate/mystery): маршрут → ветка успеха/провала → их исходы.
    if (isBranching(parsed)) {
      const d = parsed as Record<string, unknown>;
      const s1 = (d['stage1'] ?? {}) as { test?: Test };
      const sb = (d['successBranch'] ?? {}) as Branch;
      const fb = (d['failureBranch'] ?? {}) as Branch;
      const nodes: Node[] = [
        tNode('s1', 0, 200, 'Маршрут (фаза 1)', false, s1.test,
          (p) => patch({ ...d, stage1: { ...s1, test: { ...s1.test, ...p } } })),
        tNode('sb', 300, 40, 'Ветка успеха', true, sb.test,
          (p) => patch({ ...d, successBranch: { ...sb, test: { ...sb.test, ...p } } })),
        tNode('fb', 300, 360, 'Ветка провала', true, fb.test,
          (p) => patch({ ...d, failureBranch: { ...fb, test: { ...fb.test, ...p } } })),
        eNode('sb-ok', 620, -20, '✓ Успех', 'green', sb.onSuccess,
          (e) => patch({ ...d, successBranch: { ...sb, onSuccess: e } })),
        eNode('sb-fail', 620, 150, '✗ Провал', 'red', sb.onFailure,
          (e) => patch({ ...d, successBranch: { ...sb, onFailure: e } })),
        eNode('fb-ok', 620, 300, '✓ Успех', 'green', fb.onSuccess,
          (e) => patch({ ...d, failureBranch: { ...fb, onSuccess: e } })),
        eNode('fb-fail', 620, 470, '✗ Провал', 'red', fb.onFailure,
          (e) => patch({ ...d, failureBranch: { ...fb, onFailure: e } })),
      ];
      const edges: Edge[] = [
        ePass('e1', 's1', 'sb'), eFail('e2', 's1', 'fb'),
        ePass('e3', 'sb', 'sb-ok'), eFail('e4', 'sb', 'sb-fail'),
        ePass('e5', 'fb', 'fb-ok'), eFail('e6', 'fb', 'fb-fail'),
      ];
      return { nodes, edges };
    }

    // Плоская: проверка → ✓/✗ исходы.
    if (isFlat(parsed)) {
      const d = parsed;
      const nodes: Node[] = [
        tNode('test', 0, 60, 'Проверка', false, d.test,
          (p) => patch({ ...d, test: { ...d.test, ...p } })),
        eNode('ok', 320, 0, '✓ Успех', 'green', d.onSuccess, (e) => patch({ ...d, onSuccess: e })),
        eNode('fail', 320, 220, '✗ Провал', 'red', d.onFailure, (e) => patch({ ...d, onFailure: e })),
      ];
      return { nodes, edges: [ePass('e-ok', 'test', 'ok'), eFail('e-fail', 'test', 'fail')] };
    }
    return null;
  }, [parsed, patch, skills, verbs, meta]);

  // Внутреннее состояние графа: React Flow измеряет размеры узлов (нужно для
  // корректного fitView) и сохраняет их через onNodesChange. Пересинхронизируем
  // из data при каждом изменении value. Без этого fitView улетает в вырожденный
  // вьюпорт — ноды мелькают и пропадают.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    setRfNodes(graph ? graph.nodes : []);
    setRfEdges(graph ? graph.edges : []);
  }, [graph, setRfNodes, setRfEdges]);

  if (parsed === null) {
    return <div className="rf-note">Невалидный JSON — поправь во вкладке «JSON».</div>;
  }
  if (!graph) {
    return (
      <div className="rf-note">
        Структура не распознана конструктором — редактируй во вкладке «JSON».
      </div>
    );
  }
  return (
    <div className="rf-wrap">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        fitView
        minZoom={0.5}
      >
        <Background color="#3a3550" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
