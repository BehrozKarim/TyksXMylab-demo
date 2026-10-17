import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './app/App';
import { queryClient } from './app/queries';
import { DATA_MODE } from './api/client';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/workspace.css';

async function start() {
  if (DATA_MODE === 'fixtures') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  } else if (!['api', 'standalone'].includes(DATA_MODE)) throw new Error('Unknown data mode.');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
void start().catch((error) => {
  const root = document.getElementById('root')!;
  root.textContent = `Could not start Ward Evidence: ${error.message}. Check the configured data mode and reload.`;
});
