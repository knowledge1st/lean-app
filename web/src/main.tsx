import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/theme.css';
import { registerServiceWorker } from './features/notifications/push';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el contenedor de Lean.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void registerServiceWorker();
