// Индикатор долгих запросов. Живёт один на приложение и слушает счётчик запросов
// «в полёте» из lib/api — так он видит и React Query, и прямые вызовы.
//
// Показывается НЕ сразу: быстрая выборка списка отрабатывает за десятки
// миллисекунд, и мгновенный лоадер читался бы как моргание. Ждём DELAY_MS и
// показываем, только если к этому моменту запрос всё ещё идёт. Пропадает сразу,
// без задержки на скрытие: висящий «хвост» после готовой страницы раздражает
// сильнее, чем короткое появление.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getInflight, subscribeInflight } from '@/lib/api';

const DELAY_MS = 400;

export function Loader(): JSX.Element | null {
  const busy = useSyncExternalStore(subscribeInflight, getInflight, getInflight) > 0;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!busy) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), DELAY_MS);
    return () => window.clearTimeout(t);
  }, [busy]);

  if (!show) return null;

  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader-spinner" aria-hidden="true" />
      Загрузка…
    </div>
  );
}
