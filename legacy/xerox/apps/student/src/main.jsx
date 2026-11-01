import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './styles.css';
import { initTheme } from '@unihub/shared/src/ThemeToggle.jsx';
import App from './App.jsx';
initTheme();
createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
