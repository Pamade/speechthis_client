import React from 'react';
import styles from "../../pages/DocumentReaderWrapper.module.scss"

interface LoadingSpinnerProps {
    message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = 'Processing your document...' }) => {
    return (
        <div className={styles.loadingOverlay}>
            <div className={styles.spinnerContainer}>
                <div className={styles.spinner}></div>
                <div className={styles.loadingText}>{message}</div>
            </div>
        </div>
    );
};

export default LoadingSpinner;
