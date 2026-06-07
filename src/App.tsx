import { Outlet } from 'react-router-dom';
import { SettingsBar } from './components/settings-bar';

// Каркас: шапка + контент текущего роута.
export function Layout() {
  return (
    <>
      <SettingsBar />
      <main className="px-5 py-6">
        <Outlet />
      </main>
    </>
  );
}
