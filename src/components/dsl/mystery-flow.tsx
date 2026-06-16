// Конструктор Тайны на нодах: каждый progress-хук — узел (триггер/when/проверка/
// стоимость/эффект) с ребром в узел-цель «Тайна»; отдельный узел onEnter.
// Два вида одного data: граф ↔ JSON. Словарь — из /meta.
import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, Handle, Position, Panel,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Meta, VerbDef } from '@/lib/api';
import { Combobox } from '@/components/combobox';
import { NumField } from '@/components/num-field';
import { EffectList } from '@/components/dsl/effect-list';

type Eff = Record<string, unknown>;
type Hook = Record<string, unknown>;
type Obj = Record<string, unknown>;

const DEFAULT_SKILLS = ['lore', 'influence', 'observation', 'strength', 'will'];
const FALLBACK_TRIGGERS = [
  'encounterAtEldritchToken', 'gateClosed',
  'monsterDefeated', 'researchEncounterResolved',
];
const FALLBACK_SOLVE = ['tokensOnCard', 'cluesOnCard', 'monsterDefeated'];
const RESOURCES = ['clue', 'sanity', 'health', 'focus'];

// ── Узлы ──────────────────────────────────────────────────────────────────────

interface SolveData extends Record<string, unknown> {
  kind: string; n: number; perPlayer: number; kinds: string[];
  onPatch: (p: Obj) => void;
}
function SolveNode(props: NodeProps): JSX.Element {
  const d = props.data as unknown as SolveData;
  return (
    <div className="rf-node nodrag nopan" style={{ minWidth: 200 }}>
      <Handle type="target" position={Position.Left} />
      <div className="rf-node-title">Тайна — финал (solveCondition)</div>
      <label>Условие (kind)</label>
      <Combobox value={d.kind} options={d.kinds} onChange={(v) => d.onPatch({ kind: v })} />
      {d.kind === 'tokensOnCard' ? (
        <>
          <label className="mt-1">perPlayer</label>
          <input type="number" step="0.5" className="w-16" value={d.perPlayer}
            onChange={(e) => d.onPatch({ perPlayer: parseFloat(e.target.value) || 0 })} />
        </>
      ) : (
        <>
          <label className="mt-1">n</label>
          <NumField value={d.n} onChange={(n) => d.onPatch({ n })} min={1} />
        </>
      )}
    </div>
  );
}

interface OnEnterData extends Record<string, unknown> {
  effects: Eff[]; verbs: string[]; onEffects: (e: Eff[]) => void;
  locations: { id: string; name: string }[];
  targets?: string[];
  verbDefs?: Record<string, VerbDef>;
  targetGroups?: Record<string, string[]>;
}
function OnEnterNode(props: NodeProps): JSX.Element {
  const d = props.data as unknown as OnEnterData;
  return (
    <div className="rf-node nodrag nopan" style={{ minWidth: 240 }}>
      <div className="rf-node-title">При активации (onEnter)</div>
      <EffectList value={d.effects} onChange={d.onEffects} verbs={d.verbs} verbDefs={d.verbDefs} targetGroups={d.targetGroups} locations={d.locations} targets={d.targets} />
    </div>
  );
}

interface HookData extends Record<string, unknown> {
  hook: Hook; triggers: string[]; skills: string[]; verbs: string[];
  locations: { id: string; name: string }[];
  targets?: string[];
  verbDefs?: Record<string, VerbDef>;
  targetGroups?: Record<string, string[]>;
  onHook: (h: Hook) => void; onRemove: () => void;
}
function HookNode(props: NodeProps): JSX.Element {
  const d = props.data as unknown as HookData;
  const h = d.hook;
  const when = (h['when'] ?? {}) as Obj;
  const test = (h['test'] ?? null) as Obj | null;
  const cost = (h['cost'] ?? null) as Obj | null;
  const set = (patch: Hook): void => d.onHook({ ...h, ...patch });
  const setWhen = (p: Obj): void => set({ when: { ...when, ...p } });
  return (
    <div className="rf-node nodrag nopan" style={{ minWidth: 280 }}>
      <Handle type="source" position={Position.Right} style={{ background: '#c7a84a' }} />
      <div className="rf-node-title flex items-center justify-between">
        <span>Правило разгадки</span>
        <button type="button" className="danger" onClick={d.onRemove} title="удалить">×</button>
      </div>

      <label>Триггер (on)</label>
      <Combobox value={String(h['on'] ?? h['trigger'] ?? d.triggers[0])} options={d.triggers}
        onChange={(v) => set({ on: v, trigger: undefined })} />

      <label className="mt-1">Условие (when)</label>
      <div className="flex gap-3 flex-wrap">
        <label className="inline-flex gap-1 items-center">
          <input type="checkbox" checked={!!when['omenMatch']} onChange={(e) => setWhen({ omenMatch: e.target.checked || undefined })} /> омен
        </label>
        <label className="inline-flex gap-1 items-center">
          <input type="checkbox" checked={!!when['locationMarked']} onChange={(e) => setWhen({ locationMarked: e.target.checked || undefined })} /> метка
        </label>
      </div>

      <label className="inline-flex gap-1 items-center mt-1">
        <input type="checkbox" checked={!!test} onChange={(e) => set({ test: e.target.checked ? { skill: d.skills[0], modifier: 0 } : undefined })} /> проверка
      </label>
      {test && (
        <div className="flex gap-1.5 items-center mt-1">
          <Combobox className="flex-1" value={String(test['skill'] ?? d.skills[0])} options={d.skills} onChange={(v) => set({ test: { ...test, skill: v } })} />
          <NumField value={Number(test['modifier'] ?? 0)} onChange={(n) => set({ test: { ...test, modifier: n } })} />
        </div>
      )}

      <label className="inline-flex gap-1 items-center mt-1">
        <input type="checkbox" checked={!!cost} onChange={(e) => set({ cost: e.target.checked ? { spend: 'clue', amount: 1 } : undefined })} /> стоимость
      </label>
      {cost && (
        <div className="flex gap-1.5 items-center mt-1">
          <select value={String(cost['spend'] ?? 'clue')} onChange={(e) => set({ cost: { ...cost, spend: e.target.value } })}>
            {RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <NumField value={Number(cost['amount'] ?? 1)} onChange={(n) => set({ cost: { ...cost, amount: n } })} min={1} />
        </div>
      )}

      {String(h['on'] ?? h['trigger'] ?? '') === 'encounterAtEldritchToken' && (
        <label className="inline-flex gap-1 items-center mt-1" title="При успехе снять жетон/метку с клетки (повторно не зайти). Сними галку — клетку можно переиспользовать.">
          <input type="checkbox" checked={h['consumeToken'] !== false}
            onChange={(e) => set({ consumeToken: e.target.checked ? undefined : false })} /> снимать жетон с клетки
        </label>
      )}

      <label className="mt-1">Эффект</label>
      <EffectList value={(h['effect'] as Eff[]) ?? []} onChange={(e) => set({ effect: e })} verbs={d.verbs} verbDefs={d.verbDefs} targetGroups={d.targetGroups} locations={d.locations} targets={d.targets} />
    </div>
  );
}

const nodeTypes: NodeTypes = { solve: SolveNode, onenter: OnEnterNode, hook: HookNode };

// ── Граф ──────────────────────────────────────────────────────────────────────

export function MysteryFlow(
  { value, onChange, meta }: { value: string; onChange: (json: string) => void; meta?: Meta },
): JSX.Element {
  const parsed = useMemo<Obj | null>(() => {
    try {
      const o: unknown = JSON.parse(value);
      return o && typeof o === 'object' && !Array.isArray(o) ? (o as Obj) : null;
    } catch { return null; }
  }, [value]);

  const patch = useCallback((next: Obj) => onChange(JSON.stringify(next, null, 2)), [onChange]);
  const verbs = useMemo(() => [...(meta?.dsl?.actionVerbs ?? [])].sort(), [meta]);
  const skills = meta?.dsl?.skills ?? DEFAULT_SKILLS;
  const triggers = meta?.dsl?.mysteryTriggers ?? FALLBACK_TRIGGERS;
  const solveKinds = meta?.dsl?.mysterySolveKinds ?? FALLBACK_SOLVE;
  const locations = meta?.locations ?? [];
  const targets = meta?.dsl?.targets;
  const verbDefs = meta?.dsl?.verbs;
  const targetGroups = meta?.dsl?.targetGroups;

  const graph = useMemo(() => {
    if (!parsed) return null;
    const d = parsed;
    const sc = (d['solveCondition'] ?? {}) as Obj;
    const hooks: Hook[] = Array.isArray(d['progress'])
      ? (d['progress'] as Hook[])
      : (d['progressHook'] && typeof d['progressHook'] === 'object' ? [d['progressHook'] as Hook] : []);
    const setHooks = (hs: Hook[]): void => patch({ ...d, progress: hs, progressHook: undefined });

    const nodes: Node[] = [
      {
        id: 'onenter', type: 'onenter', position: { x: 0, y: -220 }, draggable: false,
        data: { effects: (d['onEnter'] as Eff[]) ?? [], verbs, verbDefs, targetGroups, locations, targets, onEffects: (e: Eff[]) => patch({ ...d, onEnter: e }) },
      },
    ];
    hooks.forEach((h, i) => nodes.push({
      id: `hook${i}`, type: 'hook', position: { x: 0, y: i * 400 }, draggable: false,
      data: {
        hook: h, triggers, skills, verbs, verbDefs, targetGroups, locations, targets,
        onHook: (nh: Hook) => setHooks(hooks.map((x, j) => (j === i ? nh : x))),
        onRemove: () => setHooks(hooks.filter((_, j) => j !== i)),
      },
    }));
    nodes.push({
      id: 'solve', type: 'solve', position: { x: 580, y: Math.max(0, (hooks.length - 1) * 200) }, draggable: false,
      data: {
        kind: String(sc['kind'] ?? 'cluesOnCard'), n: Number(sc['n'] ?? 1), perPlayer: Number(sc['perPlayer'] ?? 0.5),
        kinds: solveKinds, onPatch: (p: Obj) => patch({ ...d, solveCondition: { ...sc, ...p } }),
      },
    });
    const edges: Edge[] = hooks.map((_, i) => ({
      id: `e${i}`, source: `hook${i}`, target: 'solve', animated: true, style: { stroke: '#c7a84a' },
    }));
    const addHook = (): void =>
      setHooks([...hooks, { on: triggers[0], effect: [{ do: 'placeEldritchToken', where: 'self', count: 1 }] }]);
    return { nodes, edges, addHook };
  }, [parsed, patch, verbs, verbDefs, targetGroups, skills, triggers, solveKinds, locations, targets]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    setRfNodes(graph ? graph.nodes : []);
    setRfEdges(graph ? graph.edges : []);
  }, [graph, setRfNodes, setRfEdges]);

  if (!parsed || !graph) {
    return <div className="rf-note">Невалидный JSON — правь во вкладке «JSON».</div>;
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
        minZoom={0.4}
      >
        <Panel position="top-right">
          <button type="button" className="nodrag" onClick={graph.addHook}>+ правило</button>
        </Panel>
        <Background color="#3a3550" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
