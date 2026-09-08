import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../ui/App.jsx';
import '../../ui/theme.css';
import '../../ui/layout.css';

createRoot(document.getElementById('root')).render(<App popup />);
