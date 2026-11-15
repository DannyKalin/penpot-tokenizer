import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@penpot/plugin-styles/styles.css';
import './styles.css';
import { App } from './App';

const initialTheme =
  new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.setAttribute('data-theme', initialTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialTheme={initialTheme} />
  </StrictMode>,
);
