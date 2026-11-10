import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { startNativeRuntime } from './lib/nativeRuntime';

void startNativeRuntime().catch(() => { /* Browser controls remain available if a plugin fails. */ });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
