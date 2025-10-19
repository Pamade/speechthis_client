import React, { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface DownloadState {
    isDownloading: boolean;
    isProcessing: boolean;  // New flag to track if any file is being processed
    fileName: string;
    progress: number;
    currentChunk: number;
    totalChunks: number;
    estimatedTime: number;
    selectedVoice: string;
    selectedLanguage: string;
}

interface DownloadContextType {
    downloadState: DownloadState;
    setDownloadState: React.Dispatch<React.SetStateAction<DownloadState>>;
    startDownload: (fileName: string, totalChunks: number, voice: string, language: string) => void;
    updateProgress: (currentChunk: number) => void;
    resetDownload: () => void;
    isProcessingAny: () => boolean;  // New helper function to check processing state
    forceStopProcessing: () => void; // New method to force stop processing
}

const initialState: DownloadState = {
    isDownloading: false,
    isProcessing: false,
    fileName: '',
    progress: 0,
    currentChunk: 0,
    totalChunks: 0,
    estimatedTime: 0,
    selectedVoice: '',
    selectedLanguage: '',
};

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
    const [downloadState, setDownloadState] = useState<DownloadState>(initialState);
    const [startTime, setStartTime] = useState<number | null>(null);

    // Handle page refresh, tab close, and browser close
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (downloadState.isProcessing) {
                const message = "You have a file being processed. Are you sure you want to leave?";
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        };

        // Handle tab/browser close
        // window.addEventListener('beforeunload', handleBeforeUnload);

        // Handle navigation attempts within the app
        const handleTabClose = () => {
            if (downloadState.isProcessing) {
                toast.error('Please wait for the current file to finish processing before closing the tab.', {
                    duration: 5000,
                    position: 'top-center',
                });
            }
        };

        window.addEventListener('unload', handleTabClose);

        // Cleanup
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('unload', handleTabClose);
        };
    }, [downloadState.isProcessing]);

    const startDownload = (fileName: string, totalChunks: number, voice: string, language: string) => {
        setStartTime(Date.now());
        setDownloadState({
            isDownloading: true,
            isProcessing: true,
            fileName,
            progress: 0,
            currentChunk: 0,
            totalChunks,
            estimatedTime: 0,
            selectedVoice: voice,
            selectedLanguage: language,
        });
    };

    const updateProgress = (currentChunk: number) => {
        setDownloadState(prev => {
            const progress = (currentChunk / prev.totalChunks) * 100;

            // Check if processing is complete
            if (currentChunk === prev.totalChunks) {
                // Emit a custom event for completion
                window.dispatchEvent(new CustomEvent('processingComplete', {
                    detail: { fileName: prev.fileName }
                }));
                // Reset the download state after a short delay
                setTimeout(() => resetDownload(), 500);
            }

            // Calculate estimated time remaining
            let estimatedTime = 0;
            if (startTime && currentChunk > 0) {
                const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
                const timePerChunk = elapsedTime / currentChunk;
                estimatedTime = timePerChunk * (prev.totalChunks - currentChunk);
            }

            return {
                ...prev,
                currentChunk,
                progress,
                estimatedTime,
            };
        });
    };

    const resetDownload = () => {
        setDownloadState(initialState);
        setStartTime(null);
    };

    const isProcessingAny = () => {
        return downloadState.isProcessing;
    };

    const forceStopProcessing = () => {
        setDownloadState(initialState);
        setStartTime(null);
    };

    return (
        <DownloadContext.Provider value={{
            downloadState,
            setDownloadState,
            startDownload,
            updateProgress,
            resetDownload,
            isProcessingAny,
            forceStopProcessing
        }}>
            {children}
        </DownloadContext.Provider>
    );
}

export function useDownload() {
    const context = useContext(DownloadContext);
    if (context === undefined) {
        throw new Error('useDownload must be used within a DownloadProvider');
    }
    return context;
}
