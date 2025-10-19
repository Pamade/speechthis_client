import { useEffect, useState } from 'react';
import { createCheckoutSession } from '../../services/stripeService';
import { getProductId } from '../../utils/fileUtils';
import styles from './GoogleVoiceSelector.module.scss';
import { useNavigate } from 'react-router-dom';
import { instance } from '../../utils/axiosInstance';
import type { GoogleVoice } from '../../types/voices';
import { useGetGoogleVoices } from '../../customHooks/useGetGoogleVoices';
import { usePlaySample } from '../../customHooks/usePlaySample';
import { useUser } from '../../context/UserContext';

interface GoogleVoiceSelectorProps {
  onVoiceSelect: (voice: GoogleVoice | undefined) => void;
  selectedVoice?: GoogleVoice;
  currentPageText?: string;
  onGenerateFullPDF?: () => Promise<void>;
  isGenerating?: boolean;
  fullText: string;
  setFullText?: (text: string) => void;
  fileInfo?: {
    fileName: string;
    fileSize: string;
    fileSizeInBytes: number;
  };
}

export const GoogleVoiceSelector: React.FC<GoogleVoiceSelectorProps> = ({
  onVoiceSelect,
  selectedVoice,
  currentPageText = '',
  onGenerateFullPDF,
  isGenerating = false,
  fileInfo,
  fullText,
}) => {
  const {
    isSamplePlaying,
    isPreparing,
    handleSampleButtonClick,
    stopSamplePlayback
  } = usePlaySample();

  const {
    error: hookError,
    loading,
    languages,
    genders,
    filteredVoices,
    selectedLanguage,
    setSelectedLanguage,
    selectedGender,
    setSelectedGender,
    selectedVoice: hookSelectedVoice,
    handleVoiceSelect: hookHandleVoiceSelect
  } = useGetGoogleVoices();

  const { user } = useUser();
  const navigate = useNavigate();

  // Check if the currently selected voice is valid for current filters
  const isSelectedVoiceValid = selectedVoice && filteredVoices.some((v: GoogleVoice) => v.name === selectedVoice.name);

  useEffect(() => {
    if (filteredVoices.length > 0 && !selectedVoice) {
      localHandleVoiceSelect(filteredVoices[0]);
    }
    else if (selectedVoice && !isSelectedVoiceValid && filteredVoices.length > 0) {
      localHandleVoiceSelect(filteredVoices[0]);
    }
    else if (selectedVoice && !isSelectedVoiceValid) {
      localHandleVoiceSelect(null);
    }
  }, [selectedLanguage, selectedGender]);

  const localHandleVoiceSelect = (voice: GoogleVoice | null) => {
    hookHandleVoiceSelect(voice);
    onVoiceSelect(voice || undefined);
    stopSamplePlayback();
  };

  const playCurrentPageSample = () => {
    if (!selectedVoice || !currentPageText) return;
    handleSampleButtonClick(currentPageText, selectedVoice);
  };

  const textToBackend = async () => {
    const blob = new Blob([fullText], { type: "text/plain" });
    const file = new File([blob], `${fileInfo?.fileName}.txt`, { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", file);

    formData.append("originalFileSize", String(fileInfo?.fileSizeInBytes));
    formData.append("language", selectedVoice?.originalLanguageCode || selectedVoice?.language_code || ""); // e.g., "en-US", "es-ES", etc.
    formData.append("gender", selectedVoice?.originalGender || selectedGender);     // Use original gender for backend
    formData.append("voice", selectedVoice?.name || "");   // e.g., "en-US-Wavenet-D"
    try {
      const response = await instance.post("/files/upload", formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log("Upload success:", response.data);
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  // const handleGenerateClick = async () => {
  //   if (!selectedVoice) {
  //     alert('Please select a voice first');
  //     return;
  //   }

  //   if (!fileInfo) {
  //     alert('No file selected');
  //     return;
  //   }

  //   try {
  //     // Get the price ID based on file size
  //     const priceId = getProductId(fileInfo.fileSizeInBytes);

  //     const checkoutUrl = await createCheckoutSession({
  //       priceId,
  //       quantity: 1,
  //       textContent: fullText,
  //       languageCode: selectedVoice.language_code,
  //       voiceName: selectedVoice.namecd
  //     });

  //     // Redirect to Stripe checkout
  //     window.location.href = checkoutUrl;
  //   } catch (error) {
  //     if (error instanceof Error && error.message === 'Authentication required') {
  //       window.location.href = '/login';
  //     } else {
  //       console.error('Failed to process payment:', error);
  //     }
  //   }
  // };

  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.loadingSpinner}></span>
        Loading Google voices...
      </div>
    );
  }

  if (hookError) {
    return (
      <div className={styles.error}>
        <span className={styles.errorIcon}>⚠️</span>
        {hookError}
      </div>
    );
  }


  return (
    <div className={styles.container}>
      <div className={styles.selectors}>
        <div className={styles.selectGroup}>
          <label htmlFor="language">Language:</label>
          <select
            id="language"
            value={selectedLanguage}
            onChange={(e) => {
              setSelectedLanguage(e.target.value);
            }}
            className={styles.select}
          >
            <option value="">All Languages</option>
            {languages.map(language => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.selectGroup}>
          <label htmlFor="gender">Gender:</label>
          <select
            id="gender"
            value={selectedGender}
            onChange={(e) => {
              setSelectedGender(e.target.value);
            }}
            className={styles.select}
          >
            <option value="">All Genders</option>
            {genders.map(gender => (
              <option key={gender} value={gender}>
                {gender}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.selectGroup}>
          <label htmlFor="voice">Voice:</label>
          <select
            id="voice"
            value={selectedVoice?.name || filteredVoices[0]?.name || ''}
            onChange={(e) => {
              const selected = filteredVoices.find(voice => voice.name === e.target.value);
              if (selected) localHandleVoiceSelect(selected);
            }}
            className={styles.select}
          >
            {filteredVoices.map(voice => (
              <option key={voice.name} value={voice.name}>
                {voice.friendlyName || voice.name} ({voice.gender})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.voiceInfo}>
        <button
          className={`${styles.sampleButton} ${isPreparing ? styles.preparing : ''}`}
          onClick={playCurrentPageSample}
          disabled={!selectedVoice || isPreparing}
          title={!selectedVoice ? "Please select a voice" : isPreparing ? "Preparing audio..." : isSamplePlaying ? "Stop reading" : "Read current page"}
        >
          {isPreparing ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={styles.spinnerIcon}>
                <circle cx="12" cy="12" r="10" strokeWidth="4" strokeDasharray="30 60" />
              </svg>
              Preparing...
            </>
          ) : isSamplePlaying ? (
            <>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Stop Reading
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Read Page
            </>
          )}
        </button>
        {onGenerateFullPDF && (
          <button
            className={styles.generateButton}
            onClick={() => user ? textToBackend() : navigate('/register')}
            disabled={isGenerating || !selectedVoice}
            title={!selectedVoice ? "Please select a voice" : user ? "Generate audio for the entire PDF" : "Create an account to generate MP3"}
          >
            {isGenerating ? (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4v16m8-8H4" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  {user ? (
                    <path d="M12 4v16m8-8H4" />
                  ) : (
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
                  )}
                </svg>
                {user ? 'Generate MP3' : 'Create Account'}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}; 