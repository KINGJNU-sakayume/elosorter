import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import ConfirmProvider from './components/ui/ConfirmProvider';
import PlayerProvider from './player/PlayerProvider';
import AppProvider from './state/AppProvider';
import ThemeProvider from './theme/ThemeProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AppProvider>
          <PlayerProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </PlayerProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
