import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import 'open-glass-ui/styles.css';
import './styles.css';
import './divergence.css';
import { installDiagnostics } from './diagnostics-api';
import { installNativeBridge } from './native-bridge';
import { installDesktopBridge } from './desktop-bridge';

await installDesktopBridge();
await installNativeBridge();
installDiagnostics();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
