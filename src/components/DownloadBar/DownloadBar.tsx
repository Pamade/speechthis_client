import React from 'react';
import { createPortal } from 'react-dom';
import styles from './DownloadBar.module.scss';
import { useDownload } from '../../context/DownloadContext';

export function DownloadBar() {
    const { downloadState, forceStopProcessing } = useDownload();
    const {
        isDownloading,
        fileName,
        progress,
        currentChunk,
        totalChunks,
        selectedVoice,
        selectedLanguage,
    } = downloadState;

    const handleStop = () => {
        if (window.confirm('Are you sure you want to stop the current process? This action cannot be undone.')) {
            // Get the current filename from downloadState
            const currentFile = downloadState.fileName;
            // Create a custom event to notify Profile component
            const event = new CustomEvent('processingCancelled', {
                detail: { fileName: currentFile }
            });
            window.dispatchEvent(event);

            forceStopProcessing();
        }
    };

    React.useEffect(() => {
        // Add class to body when download bar is visible
        if (isDownloading) {
            document.body.classList.add('download-bar-visible');
        } else {
            document.body.classList.remove('download-bar-visible');
        }

        // Cleanup on unmount
        return () => {
            document.body.classList.remove('download-bar-visible');
        };
    }, [isDownloading]);

    if (!isDownloading) return null;

    const content = (
        <div className={styles.downloadBar}>
            <div className={styles.downloadContent}>
                <div className={styles.downloadInfo}>
                    <div className={styles.mainInfo}>
                        <span className={styles.fileName}>{fileName}</span>
                        <span className={styles.status}>
                            Processing chunk {currentChunk} of {totalChunks}
                        </span>
                    </div>
                    <div className={styles.details}>
                        <span className={styles.voiceInfo}>
                            {selectedLanguage} • {selectedVoice}
                        </span>
                        <button
                            className={styles.stopButton}
                            onClick={handleStop}
                            title="Stop processing"
                            aria-label="Stop processing"
                        >
                            ✕
                        </button>
                    </div>
                </div>
                <div className={styles.progressContainer}>
                    <div
                        className={styles.progressBar}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );

    const portalContainer = document.getElementById('download-bar-portal');
    if (!portalContainer) return null;

    return createPortal(content, portalContainer);
}
