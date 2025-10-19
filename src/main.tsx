import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { DownloadProvider } from './context/DownloadContext'
import { DownloadBar } from './components/DownloadBar/DownloadBar'

createRoot(document.getElementById('root')!).render(
    <DownloadProvider>
        <App />
        <DownloadBar />
    </DownloadProvider>
)
