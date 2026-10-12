// Числовое поле без нативного спиннера (он «залипает» внутри React Flow) —
// явные кнопки −/+ (один клик = один шаг) + ручной ввод.
export function NumField(
  { value, onChange, min = -9, className, step }:
  { value: number; onChange: (n: number) => void; min?: number; className?: string; step?: number },
): JSX.Element {
  const set = (n: number): void => onChange(Math.max(min, n));
  return (
    <div className={`numf nodrag nopan ${className ?? ''}`}>
      <button type="button" tabIndex={-1} onClick={() => set(value - (step ?? 1))}>−</button>
      <input
        type="number"
        step={step ?? 1}
        className="w-9 text-center"
        value={value}
        onChange={(e) => set((step ? parseFloat(e.target.value) : parseInt(e.target.value)) || 0)}
      />
      <button type="button" tabIndex={-1} onClick={() => set(value + (step ?? 1))}>+</button>
    </div>
  );
}
