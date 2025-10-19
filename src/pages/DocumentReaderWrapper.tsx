import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  FaArrowLeft, FaBookOpen,
  FaMoon, FaSun, FaTachometerAlt,
  FaSearchMinus, FaSearchPlus, FaSyncAlt
} from "react-icons/fa";
import { MdReplay10, MdForward10 } from "react-icons/md";
import PdfViewer from "../components/PdfViewer/PdfViewer";
import { useNavigate } from "react-router-dom";
import styles from "./DocumentReaderWrapper.module.scss";
import { useAzureTTS } from "../customHooks/useAzureTTS";
import toast from "react-hot-toast";
import LoadingSpinner from "../components/LoadingSpinner/LoadingSpinner";
import { usePdfLoader } from "../customHooks/usePdfLoader";

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const calculateDefaultZoom = (width: number): number => {
  if (width < 480) return 0.35;
  if (width < 768) return 0.6;
  if (width < 1200) return 0.8;
  return 1;
};

interface DocumentReaderWrapperProps {
  isSampleMode?: boolean;
  initialPdfData?: ArrayBuffer | Uint8Array;
  initialFileName?: string;
}

const DocumentReaderWrapper: React.FC<DocumentReaderWrapperProps> = ({
  isSampleMode = false,
  initialPdfData,
  initialFileName
}) => {
  const navigate = useNavigate();

  // Store initial sample data in a ref to prevent re-renders from changing it
  const sampleDataRef = useRef<ArrayBuffer | Uint8Array | null>(null);

  // Initialize sample data ref only once
  if (isSampleMode && initialPdfData && !sampleDataRef.current) {
    sampleDataRef.current = initialPdfData;
  }

  // Conditionally use PDF loader hook only when not in sample mode
  const pdfLoaderResult = usePdfLoader();
  const { pdfData: loadedPdfData, fileName: loadedFileName, isLoading: pdfLoading, isFromDashboard, setIsLoading } =
    isSampleMode ? { pdfData: null, fileName: null, isLoading: false, isFromDashboard: false, setIsLoading: () => { } } : pdfLoaderResult;

  // Use either sample data (from ref for stability) or loaded data
  const pdfData = isSampleMode ? sampleDataRef.current : loadedPdfData;
  const fileName = isSampleMode ? initialFileName : loadedFileName;
  const isLoading = isSampleMode ? false : pdfLoading;
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [documentText, setDocumentText] = useState<string>("");
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const initialWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const [zoomLevel, setZoomLevel] = useState(() => calculateDefaultZoom(initialWidth));
  const [zoomWasAdjusted, setZoomWasAdjusted] = useState(false);
  const clampZoom = useCallback((value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)), []);

  const applyZoom = useCallback((value: number, options?: { isManual?: boolean }) => {
    const next = clampZoom(value);
    setZoomLevel(next);
    setZoomWasAdjusted(options?.isManual ?? true);
  }, [clampZoom]);

  const handleZoomIn = useCallback(() => {
    applyZoom(zoomLevel + ZOOM_STEP, { isManual: true });
  }, [applyZoom, zoomLevel]);

  const handleZoomOut = useCallback(() => {
    applyZoom(zoomLevel - ZOOM_STEP, { isManual: true });
  }, [applyZoom, zoomLevel]);

  const handleZoomReset = useCallback(() => {
    const width = typeof window !== "undefined" ? window.innerWidth : initialWidth;
    applyZoom(calculateDefaultZoom(width), { isManual: false });
  }, [applyZoom, initialWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleResize = () => {
      if (!zoomWasAdjusted) {
        const width = window.innerWidth;
        setZoomLevel(calculateDefaultZoom(width));
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [zoomWasAdjusted]);

  const zoomPercentage = useMemo(() => Math.round(zoomLevel * 100), [zoomLevel]);

  // Create a stable file object with proper memoization
  const file = useMemo(() => {
    if (!pdfData) return null;

    // Return the data directly - avoid creating new buffers
    if (pdfData instanceof ArrayBuffer) {
      return { data: pdfData as ArrayBuffer };
    }

    // For Uint8Array, return the underlying buffer directly
    if (pdfData instanceof Uint8Array) {
      return { data: pdfData.buffer as ArrayBuffer };
    }

    return { data: pdfData as ArrayBuffer };
  }, [pdfData]);

  // Azure language/voice selections with user-friendly names
  const languageNames: Record<string, string> = {
    "en-US": "English (US)",
    "en-GB": "English (UK)",
    "es-ES": "Spanish",
    "fr-FR": "French",
    "de-DE": "German",
    "it-IT": "Italian",
    "pt-PT": "Portuguese",
    "pt-BR": "Portuguese (Brazil)",
    "nl-NL": "Dutch",
    "sv-SE": "Swedish",
    "no-NO": "Norwegian",
    "da-DK": "Danish",
    "fi-FI": "Finnish",
    "pl-PL": "Polish",
    "cs-CZ": "Czech",
    "sk-SK": "Slovak",
    "hu-HU": "Hungarian",
    "ro-RO": "Romanian",
    "bg-BG": "Bulgarian",
    "hr-HR": "Croatian",
    "sl-SI": "Slovenian",
    "et-EE": "Estonian",
    "lv-LV": "Latvian",
    "lt-LT": "Lithuanian",
    "ja-JP": "Japanese",
    "zh-CN": "Chinese",
    "ru-RU": "Russian",
    "ar-EG": "Arabic",
    "hi-IN": "Hindi"
  };

  const voicesByLocale: Record<string, { label: string; value: string }[]> = {
    "en-US": [
      { label: "Jenny", value: "en-US-JennyNeural" },
      { label: "Guy", value: "en-US-GuyNeural" },
      { label: "Aria", value: "en-US-AriaNeural" },
      { label: "Davis", value: "en-US-DavisNeural" }
    ],
    "en-GB": [
      { label: "Libby", value: "en-GB-LibbyNeural" },
      { label: "Ryan", value: "en-GB-RyanNeural" }
    ],
    "es-ES": [
      { label: "Elvira", value: "es-ES-ElviraNeural" },
      { label: "Alvaro", value: "es-ES-AlvaroNeural" }
    ],
    "fr-FR": [
      { label: "Denise", value: "fr-FR-DeniseNeural" },
      { label: "Henri", value: "fr-FR-HenriNeural" }
    ],
    "de-DE": [
      { label: "Katja", value: "de-DE-KatjaNeural" },
      { label: "Conrad", value: "de-DE-ConradNeural" }
    ],
    "it-IT": [
      { label: "Elsa", value: "it-IT-ElsaNeural" },
      { label: "Isabella", value: "it-IT-IsabellaNeural" }
    ],
    "pt-PT": [
      { label: "Raquel", value: "pt-PT-RaquelNeural" },
      { label: "Duarte", value: "pt-PT-DuarteNeural" }
    ],
    "pt-BR": [
      { label: "Francisca", value: "pt-BR-FranciscaNeural" },
      { label: "Antonio", value: "pt-BR-AntonioNeural" }
    ],
    "nl-NL": [
      { label: "Colette", value: "nl-NL-ColetteNeural" },
      { label: "Maarten", value: "nl-NL-MaartenNeural" }
    ],
    "sv-SE": [
      { label: "Sofie", value: "sv-SE-SofieNeural" },
      { label: "Mattias", value: "sv-SE-MattiasNeural" }
    ],
    "no-NO": [
      { label: "Pernille", value: "no-NO-PernilleNeural" },
      { label: "Finn", value: "no-NO-FinnNeural" }
    ],
    "da-DK": [
      { label: "Christel", value: "da-DK-ChristelNeural" },
      { label: "Jeppe", value: "da-DK-JeppeNeural" }
    ],
    "fi-FI": [
      { label: "Noora", value: "fi-FI-NooraNeural" },
      { label: "Harri", value: "fi-FI-HarriNeural" }
    ],
    "pl-PL": [
      { label: "Zofia", value: "pl-PL-ZofiaNeural" },
      { label: "Marek", value: "pl-PL-MarekNeural" }
    ],
    "cs-CZ": [
      { label: "Vlasta", value: "cs-CZ-VlastaNeural" },
      { label: "Antonin", value: "cs-CZ-AntoninNeural" }
    ],
    "sk-SK": [
      { label: "Viktoria", value: "sk-SK-ViktoriaNeural" },
      { label: "Lukas", value: "sk-SK-LukasNeural" }
    ],
    "hu-HU": [
      { label: "Noemi", value: "hu-HU-NoemiNeural" },
      { label: "Tamas", value: "hu-HU-TamasNeural" }
    ],
    "ro-RO": [
      { label: "AmeliaNeural", value: "ro-RO-AmeliaNeural" },
      { label: "Emil", value: "ro-RO-EmilNeural" }
    ],
    "bg-BG": [
      { label: "Kalina", value: "bg-BG-KalinaNeural" },
      { label: "Borislav", value: "bg-BG-BorislavNeural" }
    ],
    "hr-HR": [
      { label: "Gabrijela", value: "hr-HR-GabrijelaNeural" },
      { label: "Srecko", value: "hr-HR-SreckoNeural" }
    ],
    "sl-SI": [
      { label: "Petra", value: "sl-SI-PetraNeural" },
      { label: "Rok", value: "sl-SI-RokNeural" }
    ],
    "et-EE": [
      { label: "Anu", value: "et-EE-AnuNeural" },
      { label: "Kert", value: "et-EE-KertNeural" }
    ],
    "lv-LV": [
      { label: "Everita", value: "lv-LV-EveritaNeural" },
      { label: "Nils", value: "lv-LV-NilsNeural" }
    ],
    "lt-LT": [
      { label: "Ona", value: "lt-LT-OnaNeural" },
      { label: "Leonas", value: "lt-LT-LeonasNeural" }
    ],
    "ja-JP": [
      { label: "Nanami", value: "ja-JP-NanamiNeural" }
    ],
    "zh-CN": [
      { label: "Xiaoxiao", value: "zh-CN-XiaoxiaoNeural" },
      { label: "Yunxi", value: "zh-CN-YunxiNeural" }
    ],
    "ru-RU": [
      { label: "Dariya", value: "ru-RU-DariyaNeural" }
    ],
    "ar-EG": [
      { label: "Salma", value: "ar-EG-SalmaNeural" }
    ],
    "hi-IN": [
      { label: "Swara", value: "hi-IN-SwaraNeural" }
    ]
  };

  const [selectedLocale, setSelectedLocale] = useState<string>("en-US");
  const [selectedVoice, setSelectedVoice] = useState<string>("en-US-JennyNeural");
  const [rate, setRate] = useState(1.0);

  // Interface for file data passed from Dashboard
  // No cleanup needed for ArrayBuffer
  useEffect(() => {
    // This effect is now empty
  }, []);

  // Initialize TTS hook
  const ttsState = useAzureTTS({
    voice: selectedVoice,
    rate: rate,
    sampleMode: isSampleMode, // Enable sample mode for public endpoint

    onComplete: () => {
      toast.success("Reading completed!");
    },
    onError: (error) => {
      console.error('TTS Error:', error);

      // Handle synthesis loading messages differently from actual errors

      // Handle success message
      if (error.includes('Audio ready - starting playback')) {
        toast.dismiss("synthesis-loading");
        toast.success("Audio ready!", {
          duration: 2000,
          id: "synthesis-ready"
        });
        return;
      }

      // Dismiss any loading toasts when real errors occur
      toast.dismiss("synthesis-loading");

      // User-friendly error messages
      if (error.includes('1006') || error.includes('Unable to contact server')) {
        toast.error("Connection error - please try again in a moment.", {
          duration: 6000,
          id: "connection-error"
        });
      } else if (error.includes('timeout')) {
        toast.error("Request timed out. Please try again.", {
          duration: 5000,
          id: "timeout-error"
        });
      } else if (error.includes('Authentication') || error.includes('401')) {
        toast.error("Authentication failed. Please check your API key.", {
          duration: 5000,
          id: "auth-error"
        });
      } else if (error.includes('429') || error.includes('Too Many Requests')) {
        toast.error("Rate limit exceeded. Please wait 1-2 minutes.", {
          duration: 8000,
          id: "rate-limit-error"
        });
      } else {
        toast.error(`Speech synthesis failed: ${error}`, {
          duration: 5000,
          id: "synthesis-error"
        });
      }
    }
  });

  const handleSeek = (delta: number) => {
    if (isSeeking) return;

    setIsSeeking(true);
    ttsState.seekBySeconds?.(delta);

    setTimeout(() => {
      setIsSeeking(false);
    }, 1000); // 1-second throttle
  };

  const handlePlay = async () => {
    if (!documentText) {
      toast.error("No document text available");
      return;
    }
    try {
      if (ttsState.isPaused) {
        console.log("▶️ Resuming playback");
        await ttsState.resume();
      } else if (!ttsState.isPlaying) {
        console.log("🔄 Starting new synthesis and playback");

        // Check if we need to synthesize first
        if (ttsState.chunksReady === 0) {
          await ttsState.synthesizeText(documentText);
          toast.dismiss("synthesis-toast");
        }

        await ttsState.play();
      }
    } catch (err) {
      console.error("❌ Error starting speech:", err);
    }
  };

  const handlePause = () => {
    if (!ttsState.isPlaying) return;

    ttsState.pause();
  };

  // Handle zoom operations by pausing reading for 3 seconds
  // const handleZoomOperation = useCallback(async () => {
  //   if (!ttsState.isPlaying) return; // Only pause if currently playing

  //   console.log("🔍 Zoom operation started - pausing reading for 3 seconds");
  //   const wasPlaying = ttsState.isPlaying && !ttsState.isPaused;

  //   if (wasPlaying) {
  //     ttsState.pause();
  //     toast("Reading paused during zoom", { icon: "🔍", id: "zoom-pause-toast", duration: 3000 });

  //     // Resume after 3 seconds
  //     setTimeout(async () => {
  //       try {
  //         await ttsState.resume();
  //         toast.dismiss("zoom-pause-toast");
  //         console.log("▶️ Resuming reading after zoom");
  //       } catch (err) {
  //         console.error("Error resuming after zoom:", err);
  //       }
  //     }, 3000);
  //   }
  // }, [ttsState]);

  // Removed percentage-based seek; replaced by text-offset seek and +/- seconds.

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const handleTextExtracted = useCallback(async (text: string) => {
    console.log("📝 Processing text extraction...");
    setDocumentText(text);

    // Stop loading spinner
    setIsLoading(false);
  }, []);

  // Apply new voice by re-synthesizing with currently loaded text
  const applyVoiceChange = useCallback(async (newVoice: string) => {
    setSelectedVoice(newVoice);
    if (!documentText) return;

    const wasPlaying = ttsState.isPlaying && !ttsState.isPaused;
    const wasPaused = ttsState.isPaused;
    let lastKnownTextPosition = 0;

    // Capture current position before stopping
    if (wasPlaying || wasPaused) {
      const currentPosition = ttsState.getCurrentPosition();
      lastKnownTextPosition = currentPosition?.absoluteTextPosition || 0;
      console.log(`📍 Capturing position before voice change: ${lastKnownTextPosition}, wasPlaying: ${wasPlaying}, wasPaused: ${wasPaused}`);

      if (wasPlaying) {
        ttsState.pause(); // Use pause to gracefully stop and store position
      }
    }

    try {
      // Stop any playback. The position is already captured.
      ttsState.stop();

      toast.loading("Updating voice…", { id: "voice-change" });

      // Re-synthesize the text with the new voice, preserving the chunk structure.
      await ttsState.synthesizeText(documentText, true, newVoice);
      toast.dismiss("voice-change");

      // Restore position if we had one, regardless of whether we were playing or paused
      if (lastKnownTextPosition > 0) {
        console.log(`🗣️ Restoring position after voice change: ${lastKnownTextPosition}`);
        await ttsState.seekToTextOffset(lastKnownTextPosition);

        // Only resume playback if we were actually playing (not paused)
        if (wasPlaying) {
          // Position is already set by seekToTextOffset, it will start playing
        }
      } else if (wasPlaying) {
        // If we were playing but had no position, just start from the beginning
        await ttsState.play();
      }
    } catch (e) {
      toast.dismiss("voice-change");
      toast.error("Failed to apply voice");
      console.error("Error applying voice change:", e);
    }
  }, [documentText, ttsState]);

  const handleLocaleChange = useCallback(async (locale: string) => {
    setSelectedLocale(locale);
    const voices = voicesByLocale[locale] || [];
    const nextVoice = voices[0]?.value;
    if (nextVoice) {
      await applyVoiceChange(nextVoice);
    }
  }, [applyVoiceChange, voicesByLocale]);

  const handleRateChange = useCallback(async (newRate: number) => {
    setRate(newRate);

    // The useAzureTTS hook now handles rate changes internally with SSML
    try {
      await ttsState.setRate(newRate);
    } catch (e) {
      console.error("Failed to update speed:", e);
      toast.error("Failed to update speed");
    }
  }, [ttsState]);


  return (
    <div className={`${styles.container} ${darkMode ? styles.darkMode : ''}`}>
      {isLoading && <LoadingSpinner message="Processing your document..." />}

      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(isSampleMode ? "/" : (isFromDashboard ? "/dashboard" : "/profile"))}>
          <FaArrowLeft />
        </button>
        <h1 className={styles.title}>
          <FaBookOpen /> {fileName}
        </h1>
        <div className={styles.headerControls}>
          <button
            className={styles.iconButton}
            onClick={toggleDarkMode}
            title={darkMode ? "Light Mode" : "Dark Mode"}
          >
            {darkMode ? <FaSun /> : <FaMoon />}
          </button>
          {/* <button
            className={styles.iconButton}
            onClick={() => setShowTools(!showTools)}
            title={showTools ? "Hide Tools" : "Show Tools"}
          >
            <FaFont />
          </button> */}
        </div>
      </header>

      {/* {showTools && (
        <div className={styles.toolsBar}>
          <div className={styles.toolGroup}>
            <button className={styles.toolButton} onClick={openFileDialog}>
              Open Document
            </button>
            <button className={styles.toolButton}>
              <FaSearch /> Search
            </button>
            <button className={styles.toolButton}>
              <FaBookmark /> Bookmarks
            </button>
          </div>
        </div>
      )} */}

      <div className={styles.content}>
        {!file ? (
          <div className={styles.uploadPrompt}>
            <div className={styles.uploadCard}>
              <FaBookOpen className={styles.bookIcon} />
              <h2>No Document Loaded</h2>
              <p>Please upload and select a document from your Reading Library to start reading</p>
              <button
                className={styles.uploadButton}
                onClick={() => navigate('/dashboard', { state: { activeTab: 'reading' } })}
              >
                Go to Reading Library
              </button>
              <div className={styles.formatNote}>
                Upload documents in Dashboard → Reading Library
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.readerView}>
            <PdfViewer
              // setIsLoading={setIsLoading}
              file={file}
              isPlaying={ttsState.isPlaying}
              currentWord={ttsState.currentWord}
              currentTextPosition={ttsState.currentTextPosition}
              onTextExtracted={handleTextExtracted}
              isSeeking={ttsState.isSeeking}
              readyTextMaxOffset={ttsState.readyTextMaxOffset}
              onRequestSeekToTextOffset={(pos) => ttsState.seekToTextOffset?.(pos)}
              zoomLevel={zoomLevel}
              onZoomChange={applyZoom}
              minZoom={ZOOM_MIN}
              maxZoom={ZOOM_MAX}
            />
          </div>
        )}
      </div>

      {file && (
        <div className={styles.audioPlayerBar}>
          <div className={styles.audioControls}>
            <div className={styles.mobileZoomControlsLeft}>
              <button
                type="button"
                className={styles.zoomButton}
                onClick={handleZoomOut}
                title="Zoom out"
                aria-label="Zoom out"
              >
                <FaSearchMinus />
              </button>
              <span className={styles.zoomLevel}>{zoomPercentage}%</span>
            </div>
            <div className={styles.playbackControls}>
              <button
                className={styles.skipButton}
                onClick={() => handleSeek(-10)}
                title="Rewind 10 seconds"
                aria-label="Rewind 10 seconds"
                disabled={isSeeking || ttsState.isLoading}
              >
                <MdReplay10 />
              </button>

              <button
                className={`${styles.controlButton} ${styles.primaryButton} ${(ttsState.isPlaying && !ttsState.isPaused) ? styles.active : ''}`}
                title={
                  ttsState.isLoading ? "Loading..." :
                    ttsState.isPaused ? "Resume" :
                      (ttsState.isPlaying && !ttsState.isPaused) ? "Pause" : "Play"
                }
                onClick={(ttsState.isPlaying && !ttsState.isPaused) ? handlePause : handlePlay}
                disabled={ttsState.isLoading}
              >
                {ttsState.isLoading ? (
                  <div className={styles.miniSpinner}></div>
                ) : (
                  <i className={(ttsState.isPlaying && !ttsState.isPaused) ? styles.pauseIcon : styles.playIcon}></i>
                )}
              </button>

              <button
                className={styles.skipButton}
                onClick={() => handleSeek(10)}
                title="Forward 10 seconds"
                aria-label="Forward 10 seconds"
                disabled={isSeeking || ttsState.isLoading}
              >
                <MdForward10 />
              </button>
            </div>
            <div className={styles.mobileZoomControlsRight}>
              {/* <button
                type="button"
                className={styles.zoomButton}
                onClick={handleZoomReset}
                title="Reset zoom"
                aria-label="Reset zoom"
              >
                <FaSyncAlt />
              </button> */}
              <button
                type="button"
                className={styles.zoomButton}
                onClick={handleZoomIn}
                title="Zoom in"
                aria-label="Zoom in"
              >
                <FaSearchPlus />
              </button>
            </div>
          </div>

          {/* Empty spacer for centering */}
          <div className={styles.progressContainer}>
            <div className={styles.timeDisplay} />
          </div>

          <div className={styles.audioSettings}>
            <fieldset className={styles.selectFieldset}>
              <legend className={styles.legend}>Language</legend>
              <select
                id="azure-locale"
                className={styles.select}
                value={selectedLocale}
                onChange={(e) => handleLocaleChange(e.target.value)}
                disabled={ttsState.isLoading || ttsState.isSynthesizing}
              >
                {Object.keys(voicesByLocale).map(loc => (
                  <option key={loc} value={loc}>{languageNames[loc]}</option>
                ))}
              </select>
            </fieldset>
            <fieldset className={styles.selectFieldset}>
              <legend className={styles.legend}>Voice</legend>
              <select
                id="azure-voice"
                className={styles.select}
                value={selectedVoice}
                onChange={(e) => applyVoiceChange(e.target.value)}
                disabled={ttsState.isLoading || ttsState.isSynthesizing}
              >
                {(voicesByLocale[selectedLocale] || []).map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </fieldset>
            <div className={styles.rateControl}>
              <FaTachometerAlt />
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={rate}
                onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                className={styles.rateSlider}
                disabled={ttsState.isLoading || ttsState.isSynthesizing}
              />
              <span>{rate.toFixed(1)}x</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentReaderWrapper;
