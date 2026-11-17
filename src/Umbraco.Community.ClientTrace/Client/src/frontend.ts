import { initializeFrontend } from './frontend-init';
try {
  const settings=(document.currentScript as HTMLScriptElement | null)?.dataset.clientTrace;
  if (settings) initializeFrontend(window,JSON.parse(settings));
} catch { /* Missing/malformed bootstrap settings leave the page unaffected. */ }
