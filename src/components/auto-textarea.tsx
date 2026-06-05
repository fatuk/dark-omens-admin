import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

// Textarea, подстраивающая высоту под контент. Высота = scrollHeight (+ бордеры,
// т.к. box-sizing: border-box). overflow:hidden — чтобы не мелькал скроллбар и
// измерение было чистым. min-height (через style) остаётся нижней границей.
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize(): void {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const borders = el.offsetHeight - el.clientHeight;   // border-top/bottom при border-box
    el.style.height = `${el.scrollHeight + borders}px`;
  }

  // Пересчёт при каждом изменении value (в т.ч. программном — рыба/перевод/шаблон).
  useLayoutEffect(resize, [props.value]);
  // И при ресайзе окна (ширина меняет перенос строк → высоту).
  useEffect(() => {
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <textarea
      {...props}
      ref={ref}
      onInput={() => resize()}
      style={{ overflow: 'hidden', resize: 'none', ...props.style }}
    />
  );
}
