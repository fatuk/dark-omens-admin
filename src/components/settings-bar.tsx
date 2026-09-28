import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBase, setApiBase, getAdminKey, setAdminKey } from '@/lib/api';

// Шапка: ссылки + настройки подключения (API base + admin-key) в localStorage.
export function SettingsBar() {
  const [base, setBase] = useState('');
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setBase(getApiBase());
    setKey(getAdminKey());
  }, []);

  function save() {
    setApiBase(base);
    setAdminKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  return (
    <header className="bar">
      <span className="title">DARK OMENS · CONTENT</span>
      <Link to="/">Список</Link>
      <Link to="/edit/new">+ Новая</Link>
      <Link to="/users">Доступ</Link>
      <Link to="/analytics">Аналитика</Link>
      <Link to="/games">Хроники</Link>
      <span className="spacer" />
      <input
        value={base}
        onChange={(e) => setBase(e.target.value)}
        placeholder="API base (http://localhost:3031)"
        autoComplete="off"
        className="w-[240px]"
      />
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="admin-key"
        type="password"
        // new-password: менеджеры паролей не сохраняют и не подставляют ключ.
        name="admin-key"
        autoComplete="new-password"
        spellCheck={false}
        className="w-[140px]"
      />
      <button onClick={save}>{saved ? '✓' : 'Сохранить'}</button>
    </header>
  );
}
