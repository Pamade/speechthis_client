import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Dashboard.module.scss';
import toast from 'react-hot-toast';
import { instance, instanceNoAuth } from '../utils/axiosInstance';
import { UploadModal } from '../components/PDFUploader/UploadModal';
import { useDownload } from '../context/DownloadContext';
import { DownloadBar } from '../components/DownloadBar/DownloadBar';

// Language mapping for human-readable names
const LANGUAGE_MAP: Record<string, string> = {
  'en-AU': 'English (Australian)',
  'en-CA': 'English (Canadian)',
  'en-GB': 'English (British)',
  'en-IN': 'English (Indian)',
  'en-US': 'English (US)',
  'es-ES': 'Spanish (Spain)',
  'es-US': 'Spanish (US)',
  'fr-CA': 'French (Canadian)',
  'fr-FR': 'French (France)',
  'de-DE': 'German',
  'it-IT': 'Italian',
  'pt-BR': 'Portuguese (Brazilian)',
  'pt-PT': 'Portuguese (Portugal)',
  'ru-RU': 'Russian',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'zh-CN': 'Chinese (Mandarin)',
  'zh-TW': 'Chinese (Taiwan)',
  'ar-XA': 'Arabic',
  'hi-IN': 'Hindi',
  'tr-TR': 'Turkish',
  'pl-PL': 'Polish',
  'cs-CZ': 'Czech',
  'sk-SK': 'Slovak',
  'uk-UA': 'Ukrainian',
  'bg-BG': 'Bulgarian',
  'ca-ES': 'Catalan',
  'da-DK': 'Danish',
  'el-GR': 'Greek',
  'fi-FI': 'Finnish',
  'hu-HU': 'Hungarian',
  'is-IS': 'Icelandic',
  'lv-LV': 'Latvian',
  'lt-LT': 'Lithuanian',
  'nb-NO': 'Norwegian',
  'nl-BE': 'Dutch (Belgian)',
  'nl-NL': 'Dutch',
  'ro-RO': 'Romanian',
  'sr-RS': 'Serbian',
  'sv-SE': 'Swedish',
  'vi-VN': 'Vietnamese',
  'th-TH': 'Thai',
  'ms-MY': 'Malay',
  'fil-PH': 'Filipino',
  'id-ID': 'Indonesian',
  'bn-IN': 'Bengali',
  'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'ur-IN': 'Urdu',
  'cmn-CN': 'Chinese (Mandarin)',
  'cmn-TW': 'Chinese (Taiwan)',
  'yue-HK': 'Chinese (Cantonese)'
};

// Transform language codes to human-readable names
const transformLanguage = (languageCode: string): string => {
  return LANGUAGE_MAP[languageCode] || languageCode;
};

// Transform gender names  
const transformGender = (gender: string): string => {
  return gender.toLowerCase() === 'male' ? 'Male' :
    gender.toLowerCase() === 'female' ? 'Female' : gender;
};

// Extract friendly voice name from technical voice name (same as in useGetGoogleVoices)
const getFriendlyVoiceName = (voiceName: string): string => {
  // Common patterns in Google voice names:
  // en-US-Wavenet-A, en-US-Neural2-C, en-US-Standard-B, fr-FR-Chirp3-HD-Umbriel, etc.

  // Extract the part after the last hyphen and convert to friendly name
  const parts = voiceName.split('-');
  const lastPart = parts[parts.length - 1];

  // Map common voice endings to friendly names
  const voiceMap: Record<string, string> = {
    // English voices
    'A': 'Alex', 'B': 'Blake', 'C': 'Charlie', 'D': 'David', 'E': 'Emma',
    'F': 'Felix', 'G': 'Grace', 'H': 'Hannah', 'I': 'Isaac', 'J': 'James',
    'K': 'Kate', 'L': 'Lucas', 'M': 'Maya', 'N': 'Noah', 'O': 'Olivia',
    'P': 'Paul', 'Q': 'Quinn', 'R': 'Ruby', 'S': 'Sam', 'T': 'Taylor',
    'U': 'Uma', 'V': 'Victor', 'W': 'Willow', 'X': 'Xavier', 'Y': 'Yara', 'Z': 'Zoe',

    // Handle special named voices
    'Umbriel': 'Umbriel', 'Oberon': 'Oberon', 'Titania': 'Titania',
    'Ariel': 'Ariel', 'Miranda': 'Miranda', 'Caliban': 'Caliban'
  };

  // Check if it's a letter-based voice name or special name
  if (voiceMap[lastPart]) {
    return voiceMap[lastPart];
  }

  // Handle specific named voices (like Studio voices)
  if (voiceName.includes('Studio-M')) return 'Marcus';
  if (voiceName.includes('Studio-O')) return 'Olivia';
  if (voiceName.includes('Studio-Q')) return 'Quinn';

  // For voices that already have names in them, try to extract
  const nameMatch = voiceName.match(/([A-Z][a-z]+)/g);
  if (nameMatch && nameMatch.length > 0) {
    // Use the last name found (usually the actual voice name)
    return nameMatch[nameMatch.length - 1];
  }

  // Fallback: use the last part or a generic name
  return lastPart || 'Voice';
}; interface AudioFile {
  audioCreatedAt: string;
  audioFileSizeMb: number;
  audioFormat: string;
  audioId: number;
  audioPublicId: string;
  audioSignedUrl: string;
  cloudinaryTextId: number;
  documentName: string;
  durationSeconds: number;
  filename: string;
  gender: string;
  language: string;
  textPublicId: string;
  textSignedUrl: string;
  textSize: number;
  uploadedAt: string;
  userFileId: number;
  voice: string;
}

interface ReadingFile {
  pdfId: number;
  publicId: string;
  signedUrl: string;
  fileSize: number;
  createdAt: string;
  // Derived properties for UI compatibility
  id: number;
  filename: string;
  originalName: string;
  fileType: 'pdf';
  size: number;
  uploadedAt: string;
  lastOpened?: string;
}

export function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { downloadState } = useDownload();
  const [disableUploadUntilCancelled, setDisableUploadUntilCancelled] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'conversion' | 'reading'>('conversion');
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);
  // Check if user was redirected here with specific tab
  useEffect(() => {
    const state = location.state as { activeTab?: 'reading' | 'conversion' } | null;
    if (state?.activeTab) {
      setActiveTab(state.activeTab);
    }
  }, [location.state]);

  // Conversion tab state (simplified - only audio files)
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);
  const [search, setSearch] = useState('');
  const [transfer, setTransfer] = useState<number>(0);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Reading Library tab state (new)
  const [readingFiles, setReadingFiles] = useState<ReadingFile[]>([]);
  const [readingSearch, setReadingSearch] = useState('');
  const [readingCurrentPage, setReadingCurrentPage] = useState(1);
  const [isLoadingReadingFiles, setIsLoadingReadingFiles] = useState(false);

  useEffect(() => {
    if (isUploadModalOpen) {
      // Disable scroll on both body and html elements
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      // Prevent layout shift from scrollbar disappearing
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      // Re-enable scroll
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.paddingRight = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isUploadModalOpen]);

  // Fetch reading files from backend
  const fetchReadingFiles = async () => {
    setIsLoadingReadingFiles(true);
    try {
      const response = await instance.get('/files/pdfs');

      if (response.data && Array.isArray(response.data)) {
        // Transform backend response to match our interface
        const transformedFiles: ReadingFile[] = response.data.map((pdf: any) => ({
          // Backend properties
          pdfId: pdf.pdfId,
          publicId: pdf.publicId,
          signedUrl: pdf.signedUrl,
          fileSize: pdf.fileSize,
          createdAt: pdf.createdAt,
          // UI compatibility properties
          id: pdf.pdfId,
          filename: pdf.fileName || `${pdf.publicId}.pdf`,
          originalName: pdf.fileName || `Document_${pdf.pdfId}.pdf`,
          fileType: 'pdf' as const,
          size: pdf.fileSize,
          uploadedAt: pdf.createdAt,
        }));

        setReadingFiles(transformedFiles);
      } else {
        setReadingFiles([]);
      }
    } catch (error: any) {
      console.error('Error fetching reading files:', error);
      if (error.response?.status === 204 || error.response?.status === 404) {
        setReadingFiles([]);
      }
    } finally {
      setIsLoadingReadingFiles(false);
    }
  };

  useEffect(() => {
    fetchReadingFiles();
  }, []);

  // Conversion tab filters - only audio files
  const filteredConversionItems = activeTab === 'conversion' ?
    audioFiles.filter(audio => {
      const searchFilter = search.trim() === '' ? true :
        audio.documentName.toLowerCase().includes(search.toLowerCase()) ||
        audio.language.toLowerCase().includes(search.toLowerCase()) ||
        transformLanguage(audio.language).toLowerCase().includes(search.toLowerCase());
      return searchFilter;
    }) : [];

  // Reading Library filters
  const filteredReadingFiles = readingFiles.filter(file => {
    const searchFilter = readingSearch.trim() === '' ? true :
      file.originalName.toLowerCase().includes(readingSearch.toLowerCase()) ||
      file.fileType.toLowerCase().includes(readingSearch.toLowerCase());
    return searchFilter;
  });

  const fetchUserData = async () => {
    setIsLoadingFiles(true);
    try {
      const transferResponse = await instance.get<{ transfer: number }>('/available_transfer/get');
      setTransfer(transferResponse.data.transfer);

      const audiosResponse = await instance.get<AudioFile[]>(`/files/with-urls-audio`);

      if (audiosResponse.data) {
        setAudioFiles(audiosResponse.data);
      }
    } catch (error: any) {
      if (error.response?.status === 204) {
        setAudioFiles([]);
      }
      console.error('Error fetching user data:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  // Warn user before leaving page during audio conversion
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (downloadState.isProcessing) {
        event.preventDefault();
        // Modern browsers require returnValue to be set
        event.returnValue = 'Audio conversion is in progress. Are you sure you want to leave?';
        return 'Audio conversion is in progress. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [downloadState.isProcessing]);

  // Block navigation during audio conversion
  useEffect(() => {
    if (downloadState.isProcessing) {
      const handlePopState = () => {
        const confirmed = window.confirm(
          'Audio conversion is in progress. If you leave now, the conversion will be cancelled. Are you sure you want to continue?'
        );
        if (!confirmed) {
          // Push the current state back to prevent navigation
          window.history.pushState(null, '', window.location.pathname);
        }
      };

      // Prevent back/forward button navigation
      window.history.pushState(null, '', window.location.pathname);
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [downloadState.isProcessing]);

  // Disable the Upload button after a stop is requested and until 'Synthesis cancelled' toast occurs
  useEffect(() => {
    const onStopRequested = () => {
      setDisableUploadUntilCancelled(true);
    };
    const onCancelledToast = () => {
      setDisableUploadUntilCancelled(false);
    };

    window.addEventListener('processingCancelled', onStopRequested as EventListener);
    window.addEventListener('synthesisCancelled', onCancelledToast as EventListener);
    return () => {
      window.removeEventListener('processingCancelled', onStopRequested as EventListener);
      window.removeEventListener('synthesisCancelled', onCancelledToast as EventListener);
    };
  }, []);

  // Audio download function
  const handleDownloadAudio = async (audioId: number, filename: string) => {
    try {
      toast.loading('Downloading audio file...');

      // Use the new streaming endpoint
      const response = await instance.get(`/files/audio/${audioId}/stream`, {
        responseType: 'blob', // Important to handle binary data
      });

      // Create a URL for the blob
      const url = window.URL.createObjectURL(new Blob([response.data]));

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast.dismiss();
      toast.success('Audio file downloaded successfully!');
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to download audio file');
      console.error('Download error:', error);
    }
  };

  // Reading Library functions
  const handleDeleteReadingFile = async (fileId: number) => {
    const confirmed = window.confirm('Are you sure you want to delete this file?');
    if (!confirmed) return;

    try {
      await instance.delete(`/files/pdf/${fileId}`);
      setReadingFiles(prev => prev.filter(file => file.id !== fileId));
      toast.success('File deleted successfully');
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file');
    }
  };

  const handleUploadReadingFile = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.doc,.txt,.epub';
    input.multiple = false;

    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Check if user has enough transfer balance
      const fileSizeInMB = file.size / (1024 * 1024);
      if (fileSizeInMB > transfer) {
        toast.error(`Insufficient transfer balance. File size: ${fileSizeInMB.toFixed(2)} MB, Available: ${transfer.toFixed(2)} MB`);
        return;
      }

      try {
        toast.loading('Processing file for reading...');

        let pdfFile = file;
        let finalFileName = file.name;

        // Convert to PDF if necessary (using your existing conversion endpoint)
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
          toast.dismiss();
          toast.loading('Converting file to PDF...');

          const formData = new FormData();
          formData.append('file', file);

          const convertResponse = await instanceNoAuth.post('/to-pdf/convert-docx', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            responseType: 'blob',
          });

          const pdfBlob = new Blob([convertResponse.data], { type: 'application/pdf' });
          finalFileName = file.name.replace(/\.[^/.]+$/, '.pdf');
          pdfFile = new File([pdfBlob], finalFileName, { type: 'application/pdf' });
        }

        // Upload the PDF using your new endpoint
        toast.dismiss();
        toast.loading('Uploading PDF to reading library...');

        const uploadFormData = new FormData();
        uploadFormData.append('pdfFile', pdfFile);

        const uploadResponse = await instance.post('/files/upload-pdf', uploadFormData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        if (uploadResponse.data) {
          toast.dismiss();
          toast.success('File uploaded successfully!');

          // Create the reading file object from backend response
          const backendData = uploadResponse.data;
          const newFile: ReadingFile = {
            // Backend properties
            pdfId: backendData.pdfId,
            publicId: backendData.publicId,
            signedUrl: backendData.signedUrl,
            fileSize: backendData.fileSize,
            createdAt: backendData.createdAt,
            // UI compatibility properties
            id: backendData.pdfId,
            filename: `${backendData.publicId}.pdf`,
            originalName: file.name,
            fileType: 'pdf' as const,
            size: backendData.fileSize,
            uploadedAt: backendData.createdAt,
          };

          // Deduct transfer from user's balance for reading file upload
          try {
            const transferToRemove = pdfFile.size / (1024 * 1024); // Convert bytes to MB
            await instance.patch('/available_transfer/remove-transfer', null, {
              params: {
                transferToRemove: transferToRemove
              }
            });

            // Update the local transfer state
            setTransfer(prev => Math.max(0, prev - transferToRemove));

          } catch (transferError) {
            console.error('Error deducting transfer:', transferError);
            toast.error('Upload successful, but failed to update transfer balance. Please refresh to see updated balance.');
            // Don't return here - continue with the upload flow
          }

          // Refresh the reading files list from backend
          await fetchReadingFiles();

          // Refresh transfer balance to ensure it's up to date
          try {
            const transferResponse = await instance.get<{ transfer: number }>('/available_transfer/get');
            setTransfer(transferResponse.data.transfer);
          } catch (error) {
            console.error('Error refreshing transfer balance:', error);
          }

          // Automatically open in document reader
          // Note: This navigation happens after successful upload, so no processing check needed
          navigate('/document-reader', {
            state: {
              fileData: newFile,
              pdfId: backendData.pdfId // Pass the PDF ID instead of constructed URL
            }
          });
        }

      } catch (error: any) {
        toast.dismiss();
        console.error('Upload error:', error);
        toast.error(error.message || 'Failed to upload file');
      }
    };

    input.click();
  };

  const handleOpenInReader = (file: ReadingFile) => {
    // Check if audio conversion is in progress
    if (downloadState.isProcessing) {
      const confirmed = window.confirm(
        'Audio conversion is in progress. If you leave now, the conversion will be cancelled. Are you sure you want to continue?'
      );
      if (!confirmed) {
        return; // Cancel navigation
      }
    }
    console.log(file)

    // Navigate to DocumentReaderWrapper with file data and let it handle the streaming endpoint with axios
    navigate('/document-reader', {
      state: {
        fileData: file,
        pdfId: file.pdfId // Pass the PDF ID instead of constructed URL
      }
    });
  };

  const formatFileSize = (sizeInMB: number) => {
    if (sizeInMB < 1) {
      return `${(sizeInMB * 1024).toFixed(0)} KB`;
    }
    return `${sizeInMB.toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return '📄';
      case 'docx':
        return '📝';
      case 'txt':
        return '📋';
      case 'epub':
        return '📚';
      default:
        return '📁';
    }
  };

  // Pagination for Reading Library
  const readingStartIndex = (readingCurrentPage - 1) * itemsPerPage;
  const readingEndIndex = readingStartIndex + itemsPerPage;
  const paginatedReadingFiles = filteredReadingFiles.slice(readingStartIndex, readingEndIndex);
  const readingTotalPages = Math.ceil(filteredReadingFiles.length / itemsPerPage);

  // Pagination for Conversion (Audio files)
  const conversionStartIndex = (currentPage - 1) * itemsPerPage;
  const conversionEndIndex = conversionStartIndex + itemsPerPage;
  const conversionTotalPages = Math.ceil(filteredConversionItems.length / itemsPerPage);
  const documentName = (audio: AudioFile) => audio.documentName.length > 22 ? audio.documentName.replace(/\.(pdf|docx|txt|epub)$/i, '').slice(0, 22).concat('...') : audio.documentName.replace(/\.(pdf|docx|txt|epub)$/i, '');

  const getPaginationGroup = (totalPages: number, currentPage: number) => {
    const maxButtons = 3;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, currentPage + 1);

    if (currentPage === 1) {
      endPage = 3;
    }

    if (currentPage === totalPages) {
      startPage = totalPages - 2;
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <>
      {/* React 19 Native Metadata */}
      <title>Dashboard | PDF to Audio</title>
      <meta name="title" content="Dashboard | PDF to Audio" />
      <meta name="description" content="Manage your PDF to audio conversions" />
      <meta name="robots" content="noindex, nofollow" />

      <div className={styles.container}>
        <DownloadBar />

        <div className={styles.dashboard}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <h1>Dashboard</h1>
              <div className={styles.storageInfo}>
                <div className={styles.storageText}>
                  <span>Available Transfer: {transfer.toFixed(2)} MB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className={styles.tabNavigation}>
            <button
              className={`${styles.tabButton} ${activeTab === 'conversion' ? styles.active : ''}`}
              onClick={() => setActiveTab('conversion')}
            >
              Audio Conversion
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === 'reading' ? styles.active : ''}`}
              onClick={() => setActiveTab('reading')}
            >
              Reading Library
            </button>
          </div>

          {/* Tab Content */}
          <div className={styles.tabContent}>
            {activeTab === 'conversion' && (
              <>
                <div className={styles.headerUpload}>
                  <button
                    className={styles.uploadButton}
                    onClick={() => setIsUploadModalOpen(true)}
                    disabled={downloadState.isProcessing || disableUploadUntilCancelled}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                    Upload Document
                  </button>
                </div>

                <div className={styles.searchContainer}>
                  <input
                    type="text"
                    placeholder="Search generated audio files..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
              </>
            )}

            {activeTab === 'reading' && (
              <>
                <div className={styles.headerUpload}>
                  <button
                    className={styles.uploadButton}
                    onClick={handleUploadReadingFile}
                    disabled={transfer <= 0}
                    title={transfer <= 0 ? 'Insufficient transfer balance to upload files' : 'Upload document for reading'}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                    Upload for Reading
                  </button>
                </div>

                <div className={styles.searchContainer}>
                  <input
                    type="text"
                    placeholder="Search reading files..."
                    value={readingSearch}
                    onChange={(e) => setReadingSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                {isLoadingReadingFiles ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.spinner}></div>
                    <p>Loading reading library...</p>
                  </div>
                ) : (
                  <div className={styles.audioSection}>
                    {paginatedReadingFiles.length > 0 ? (
                      <>
                        <h3 className={styles.sectionTitle}>Reading Library</h3>
                        <div className={styles.readingGrid}>
                          {paginatedReadingFiles.map((file) => (
                            <div key={file.id} className={styles.readingCard}>
                              <div className={styles.readingHeader}>
                                <div className={styles.fileIcon}>
                                  {getFileTypeIcon(file.fileType)}
                                </div>
                                <div className={styles.fileInfo}>
                                  <h3>{file.originalName}</h3>
                                  <p className={styles.fileType}>{file.fileType.toUpperCase()}</p>
                                </div>
                              </div>
                              <div className={styles.readingDetails}>
                                <p><strong>Size:</strong> {formatFileSize(file.size)}</p>
                                <p><strong>Uploaded:</strong> {formatDate(file.uploadedAt)}</p>
                                <p style={{ visibility: file.lastOpened ? 'visible' : 'hidden', minHeight: '1.4em' }}>
                                  <strong>Last opened:</strong> {file.lastOpened ? formatDate(file.lastOpened) : 'Never'}
                                </p>
                              </div>
                              <div className={styles.readingActions}>
                                <button
                                  className={`${styles.actionButton} ${styles.primary}`}
                                  onClick={() => handleOpenInReader(file)}
                                >
                                  Open in Reader
                                </button>
                                <button
                                  className={styles.actionButton}
                                  onClick={() => handleDeleteReadingFile(file.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Pagination for Reading Library */}
                        {readingTotalPages > 1 && (
                          <div className={styles.pagination}>
                            <button
                              onClick={() => setReadingCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={readingCurrentPage === 1}
                              className={styles.paginationButton}
                            >
                              ‹
                            </button>
                            {getPaginationGroup(readingTotalPages, readingCurrentPage).map((pageNum) => (
                              <button
                                key={pageNum}
                                onClick={() => setReadingCurrentPage(pageNum)}
                                className={`${styles.paginationButton} ${pageNum === readingCurrentPage ? styles.active : ''}`}
                              >
                                {pageNum}
                              </button>
                            ))}
                            <button
                              onClick={() => setReadingCurrentPage(prev => Math.min(readingTotalPages, prev + 1))}
                              disabled={readingCurrentPage === readingTotalPages}
                              className={styles.paginationButton}
                            >
                              ›
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={styles.emptyState}>
                        <h3>No Reading Files Yet</h3>
                        <p>
                          {readingSearch
                            ? 'No files match your search.'
                            : transfer <= 0
                              ? 'You need transfer balance to upload documents. Please purchase more transfer to upload files for reading.'
                              : 'Upload documents to read them with AI narration!'
                          }
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Audio Conversion Content - Full Width */}
          {activeTab === 'conversion' && (
            isLoadingFiles ? (
              <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
              </div>
            ) : (
              <div className={styles.audioSection}>
                {filteredConversionItems.length > 0 ? (
                  <>
                    <h3 className={styles.sectionTitle}>Generated Audio Files</h3>
                    <div className={styles.audioGrid}>
                      {filteredConversionItems.slice(conversionStartIndex, conversionEndIndex).map((audio) => (
                        <div key={audio.audioId} className={styles.audioCard}>
                          <div className={styles.audioHeader}>
                            <h3>{documentName(audio)}</h3>
                            <span className={styles.audioFormat}>{audio.audioFormat.toUpperCase()}</span>
                          </div>
                          <div className={styles.audioDetails}>
                            <p><strong>Voice:</strong> {getFriendlyVoiceName(audio.voice)}</p>
                            <p><strong>Language:</strong> {transformLanguage(audio.language)}</p>
                            <p><strong>Size:</strong> {audio.audioFileSizeMb.toFixed(2)} MB</p>
                            <p><strong>Created:</strong> {formatDate(audio.audioCreatedAt)}</p>
                          </div>
                          <div className={styles.audioActions}>
                            <button
                              className={styles.actionButton}
                              onClick={() => handleDownloadAudio(audio.audioId, `${audio.documentName.replace(/\.(pdf|docx|txt|epub)$/i, '')}.${audio.audioFormat}`)}
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination for Conversion */}
                    {conversionTotalPages > 1 && (
                      <div className={styles.pagination}>
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className={styles.paginationButton}
                        >
                          ‹
                        </button>
                        {getPaginationGroup(conversionTotalPages, currentPage).map((pageNum) => (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`${styles.paginationButton} ${pageNum === currentPage ? styles.active : ''}`}
                          >
                            {pageNum}
                          </button>
                        ))}
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(conversionTotalPages, prev + 1))}
                          disabled={currentPage === conversionTotalPages}
                          className={styles.paginationButton}
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <h3>No Audio Files Yet</h3>
                    <p>{search ? 'No files match your search.' : 'Upload a document to generate your first audio file!'}</p>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Upload Modal */}
        {isUploadModalOpen && (
          <UploadModal
            onClose={() => setIsUploadModalOpen(false)}
            onUploadComplete={() => {
              setIsUploadModalOpen(false);
              fetchUserData();
            }}
            transfer={transfer}
          />
        )}
      </div>
    </>
  );
}
