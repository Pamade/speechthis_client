import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { DownloadProvider } from './context/DownloadContext'
import { DownloadBar } from './components/DownloadBar/DownloadBar'


const GoogleOAuthProvider = lazy(() =>
    import('@react-oauth/google').then(module => ({
        default: module.GoogleOAuthProvider
    }))
);

createRoot(document.getElementById('root')!).render(
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <DownloadProvider>
            <App />
            <DownloadBar />
        </DownloadProvider>
    </GoogleOAuthProvider>
)
