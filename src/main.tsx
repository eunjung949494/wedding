import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Handle and suppress benign Vite WebSocket connection rejection errors
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (
      reason &&
      (reason.message?.includes('WebSocket') ||
       reason.message?.includes('failed to connect') ||
       String(reason).includes('WebSocket') ||
       String(reason).includes('vite'))
    ) {
      event.preventDefault();
      console.warn('Suppressed benign development HMR error:', reason);
    }
  });

  window.addEventListener('error', (event) => {
    if (
      event.message?.includes('WebSocket') ||
      event.message?.includes('vite')
    ) {
      event.preventDefault();
      console.warn('Suppressed benign development HMR event:', event.message);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

