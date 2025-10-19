import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { instance as authenticatedAxios } from '../utils/axiosInstance';
import toast from 'react-hot-toast';

interface DashboardFileData {
    id: number;
    filename: string;
    originalName: string;
    fileType: 'pdf' | 'docx' | 'txt' | 'epub';
    size: number;
    uploadedAt: string;
    lastOpened?: string;
}

export const usePdfLoader = () => {
    const location = useLocation();
    const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
    const [fileName, setFileName] = useState<string>('Document');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isFromDashboard, setIsFromDashboard] = useState<boolean>(false);
    const fetchInitiatedRef = useRef(false);

    useEffect(() => {
        const state = location.state as { fileData?: DashboardFileData; pdfId?: number } | null;

        if (state?.fileData && !pdfData && !fetchInitiatedRef.current) {
            fetchInitiatedRef.current = true;
            setIsFromDashboard(true);
            setFileName(state.fileData.originalName);
            setIsLoading(true);

            const fetchPdfAsArrayBuffer = async () => {
                try {
                    const response = await authenticatedAxios.get(`/files/pdf/${state.fileData!.id}/stream`, {
                        responseType: 'arraybuffer',
                    });
                    setPdfData(response.data);
                    toast.success('Document loaded successfully!');
                } catch (error) {
                    console.error('Error fetching PDF as ArrayBuffer:', error);
                    toast.error('Failed to load document. Please try again.');
                } finally {
                    // setIsLoading(false);
                }
            };

            fetchPdfAsArrayBuffer();
        }
    }, [location.state, pdfData]);

    return { pdfData, fileName, isLoading, isFromDashboard, setIsLoading };
};
