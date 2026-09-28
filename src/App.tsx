import { Outlet } from 'react-router-dom';
import { SettingsBar } from './components/settings-bar';
import { Loader } from './components/loader';
import { isLocalApiBase, useConnSettings } from './lib/api';

// Заглушка вместо контента, пока не введён admin-key: без ключа любой запрос к
// relay всё равно вернёт 401, а страницы бы засыпали тостами об ошибках.
function SetupNotice() {
  return (
    <p className="text-muted max-w-[520px]">
      Введите admin-key в шапке, чтобы открыть панель.
    </p>
  );
}

// Каркас: шапка + контент текущего роута.
export function Layout() {
  const { base, key } = useConnSettings();
  // Локальный relay работает без ключа — там guard только мешал бы.
  const locked = key === '' && !isLocalApiBase(base);
  return (
    <>
      <SettingsBar />
      <Loader />
      <main className="px-5 py-6">
        {locked ? <SetupNotice /> : <Outlet />}
      </main>
    </>
  );
}
