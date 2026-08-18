import { Outlet } from 'react-router-dom';
import { SettingsBar } from './components/settings-bar';
import { Loader } from './components/loader';

// Каркас: шапка + контент текущего роута.
export function Layout() {
  return (
    <>
      <SettingsBar />
      <Loader />
      <main className="px-5 py-6">
        <Outlet />
      </main>
    </>
  );
}
