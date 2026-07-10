import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { requestPersistence } from './app/persist';
import './index.css';

void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
