import { Outlet } from 'react-router-dom';
import { SettingsBar } from './components/settings-bar';

// Каркас: шапка + контент текущего роута.
export function Layout() {
  return (
    <>
      <SettingsBar />
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
