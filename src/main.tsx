import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import './globals.css';
import { Layout } from './App';
import { ListPage } from './pages/List';
import { EditPage } from './pages/Edit';
import { UsersPage } from './pages/Users';
import { GamesPage } from './pages/Games';
import { GamePage } from './pages/Game';
import { AnalyticsPage } from './pages/Analytics';
import { ToastProvider } from './components/toast';

// SPA-роутинг. /edit/new — создание, /edit/:id — правка (id может быть 'new').
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <ListPage /> },
      { path: 'edit/:id', element: <EditPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'games', element: <GamesPage /> },
      { path: 'games/:id', element: <GamePage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false, staleTime: 30_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
