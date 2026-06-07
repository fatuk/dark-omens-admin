// Лёгкие тосты: ToastProvider (контекст) + useToast(). Автоскрытие, клик — закрыть.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error';
interface Toast { id: number; kind: Kind; text: string }
interface ToastApi { success: (t: string) => void; error: (t: string) => void }

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used within <ToastProvider>');
  return c;
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: Kind, text: string) => {
    seq += 1;
    const id = seq;
    setItems((xs) => [...xs, { id, kind, text }]);
    window.setTimeout(() => remove(id), kind === 'error' ? 5000 : 2500);
  }, [remove]);
  const api = useMemo<ToastApi>(() => ({
    success: (t) => push('success', t),
    error: (t) => push('error', t),
  }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.kind === 'error' ? 'err' : 'ok'}`}
            onClick={() => remove(t.id)}
            role="status"
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
