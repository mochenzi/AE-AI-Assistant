import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/noto-sans-sc';
import './styles.css';
import './context-manager.css';
import { App } from './ui/App';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
