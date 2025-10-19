import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.tsx'
import { DownloadProvider } from './context/DownloadContext'
import { DownloadBar } from './components/DownloadBar/DownloadBar'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <HelmetProvider>
            <DownloadProvider>
                <App />
                <DownloadBar />
            </DownloadProvider>
        </HelmetProvider>
    </StrictMode>
)
