import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DocumentReaderWrapper from "./DocumentReaderWrapper";
import LoadingSpinner from "../components/LoadingSpinner/LoadingSpinner";
import styles from "./DocumentReaderWrapper.module.scss";

const SampleReaderPage: React.FC = () => {
    const navigate = useNavigate();
    const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadSamplePdf = async () => {
            try {
                setIsLoading(true);

                // Load sample.pdf from public/documents folder
                const response = await fetch('/documents/sample.pdf');

                if (!response.ok) {
                    throw new Error('Failed to load sample document');
                }

                const arrayBuffer = await response.arrayBuffer();

                // Store ArrayBuffer directly for stable reference
                setPdfData(arrayBuffer);
                setIsLoading(false);
            } catch (err) {
                console.error('Error loading sample PDF:', err);
                setError('Failed to load sample document. Please try again later.');
                setIsLoading(false);
            }
        };

        loadSamplePdf();
    }, []);

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <LoadingSpinner />
                <p>Loading sample document...</p>
            </div>
        );
    }

    if (error || !pdfData) {
        return (
            <div className={styles.errorContainer}>
                <p>{error || 'Failed to load sample document'}</p>
                <button onClick={() => navigate('/')} className={styles.backButton}>
                    Back to Home
                </button>
            </div>
        );
    }

    return (
        <DocumentReaderWrapper
            isSampleMode={true}
            initialPdfData={pdfData}
            initialFileName="Sample Document"
        />
    );
};

export default SampleReaderPage;
