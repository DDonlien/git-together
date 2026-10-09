import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import 'open-glass-ui/styles.css';
import './styles.css';
import { installDiagnostics } from './diagnostics-api';

installDiagnostics();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
