import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { extractTextFromPDF } from '../../utils/pdfUtils';
import { formatFileSize, calculatePrice } from '../../utils/fileUtils';
import { createCheckoutSession } from '../../services/stripeService';
import styles from './PDFUploader.module.scss';

interface PDFPage {
  pageNumber: number;
  text: string;
}

interface PDFUploaderProps {
  onTextExtracted: (pages: PDFPage[], file: File) => void;
}

export function PDFUploader({ onTextExtracted }: PDFUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileSize, setFileSize] = useState<string>('');
  const [showTextEditor, setShowTextEditor] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && file.type === 'application/pdf') {
      setFile(file);
      setError(null);
      setIsProcessing(true);
      setFileSize(formatFileSize(file.size));
      try {
        const pages = await extractTextFromPDF(file);
        onTextExtracted(pages, file);
        setShowTextEditor(true);
      } catch (err) {
        setError('Failed to process PDF');
        console.error('PDF processing error:', err);
      } finally {
        setIsProcessing(false);
      }
    } else {
      setError('Please upload a PDF file');
    }
  }, [onTextExtracted]);


  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1
  });

  return (
    <div className={styles.container}>
      {/* Desktop version */}
      <div
        {...getRootProps()}
        className={`${styles.dropzone} ${isDragActive ? styles.active : ''}`}
      >
        <input {...getInputProps()} className={styles.fileInput} />

        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <h2 className={styles.title}>Upload your PDF</h2>
        <p className={styles.description}>
          Drag & drop your PDF here, or click to select
        </p>
      </div>

      {/* Mobile version */}
      <div className={styles.mobileUpload}>
        <svg
          className={styles.mobileIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            d="M12 5v14M5 12h14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <h3 className={styles.mobileTitle}>Upload PDF</h3>
        <p className={styles.mobileDescription}>
          Choose a PDF file from your device
        </p>

        <label className={styles.mobileButton}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Select PDF
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onDrop([file]);
            }}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {error && (
        <div className={styles.error}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {error}
        </div>
      )}

      {isProcessing && (
        <div className={styles.loading}>
          Processing PDF...
        </div>
      )}


    </div>
  );
}

export default PDFUploader; 