import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { installViewportFix } from './lib/viewport';
import './styles/index.css';
import './styles/themes.css';
import { applyTheme } from './lib/theme';
import { useSettings } from './stores/settings';

registerSW({ immediate: true });
// Tema antes do primeiro desenho (sem “piscar” o tema antigo)
applyTheme(useSettings.getState().theme);
installViewportFix();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
