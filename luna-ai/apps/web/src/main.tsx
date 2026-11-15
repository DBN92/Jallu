import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installViewportFix } from './lib/viewport';
import './styles/index.css';
import './styles/themes.css';
import { applyTheme } from './lib/theme';
import { useSettings } from './stores/settings';
import { diag, startDiag } from './lib/diag';
import { usePresenceStore } from './hooks/usePresence';

// Mudanças da tela que podem escurecer tudo
usePresenceStore.subscribe((s, p) => {
  if (s.dimmed !== p.dimmed) diag(`escurecida: ${s.dimmed}`);
  if (s.sleeping !== p.sleeping) diag(`tela apagada pelo app: ${s.sleeping}`);
  if (s.status !== p.status) diag(`presença: ${s.status}`);
});

// Diagnóstico (o que a tela fez, em ordem) — para investigar problemas que só acontecem no tablet
startDiag(__LUNA_BUILD__);
navigator.serviceWorker?.addEventListener('controllerchange', () => diag('versão nova da tela: recarregando'));
registerSW({ immediate: true });
// Tema antes do primeiro desenho (sem “piscar” o tema antigo)
applyTheme(useSettings.getState().theme);
installViewportFix();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
