import { useEffect, useState, useContext, lazy, Suspense, useRef } from 'react';
import { instanceNoAuth } from '../utils/axiosInstance';
import { formatFileSize } from '../utils/fileUtils';
import { extractTextFromPDF } from '../utils/pdfUtils';
import styles from './Home.module.scss';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Upload, Headphones, Globe, Zap, Lock, BookOpen, Briefcase, Dumbbell, Music } from 'lucide-react';
// import { pdfjs } from "react-pdf";
// import 'react-pdf/dist/Page/AnnotationLayer.css';
// import 'react-pdf/dist/Page/TextLayer.css';
import { useDownload } from '../context/DownloadContext';
import { UserContext } from '../context/UserContext';
import { domain } from '../utils/other';
// import samplePDF from '/documents/sample.pdf?url';
import type { DocumentProps, PageProps } from 'react-pdf';

// const Document = lazy(() => import('react-pdf').then(module => ({ default: module.Document })));
// const Page = lazy(() => import('react-pdf').then(module => ({ default: module.Page })));

// // Set up PDF.js worker with error handling
// try {
//   pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//     'pdfjs-dist/build/pdf.worker.mjs',
//     import.meta.url
//   ).toString();
// } catch (error) {
//   console.error('Failed to set PDF worker:', error);
//   // Fallback to CDN version
//   pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
// }

interface PDFPage {
  pageNumber: number;
  text: string;
}

interface GenerationProgress {
  currentChunk: number;
  totalChunks: number;
  status: string;
}

interface GoogleVoice {
  name: string;
  language: string;
  gender: string;
  language_code: string;
}

// Helper function to split text into chunks (from UploadModal)
function splitTextIntoChunks(text: string, maxBytes = 899): string[] {
  let processedText = text
    .replace(/\.\s*/g, ".\n")
    .replace(/,\s*/g, ", ")
    .split("\n")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .join("\n");

  const sentenceEndPattern = /[.!?]+\s+/g;
  const clauseEndPattern = /[,;:]\s+/g;

  const sentences = processedText.split(sentenceEndPattern);
  const chunks: string[] = [];
  let currentChunk = "";

  const encoder = new TextEncoder();
  const getBytes = (str: string) => encoder.encode(str).length;

  function pushCurrentChunk() {
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
  }

  function splitLongSentence(sentence: string) {
    const clauses = sentence.split(clauseEndPattern);
    let localChunk = "";
    for (let clause of clauses) {
      clause = clause.trim();
      if (!clause.match(/[.!?]$/)) clause += ".";
      if (getBytes(localChunk + " " + clause) > maxBytes) {
        if (localChunk) chunks.push(localChunk.trim());
        localChunk = clause;
      } else {
        localChunk += (localChunk ? " " : "") + clause;
      }
    }
    if (localChunk) chunks.push(localChunk.trim());
  }

  for (let sentence of sentences) {
    sentence = sentence.trim();
    if (!sentence.match(/[.!?]$/)) sentence += ".";

    const sentenceBytes = getBytes(sentence);
    const currentBytes = getBytes(currentChunk);

    if (sentenceBytes > maxBytes) {
      splitLongSentence(sentence);
    } else if (currentBytes + sentenceBytes > maxBytes) {
      pushCurrentChunk();
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  pushCurrentChunk();
  return chunks;
}

// Helper function to convert ArrayBuffer to base64 (from UploadModal)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
  }
  return btoa(binary);
}

function downloadMP3FromBlob(audioBlob: Blob) {
  const url = URL.createObjectURL(audioBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sample.mp3';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function Home() {
  const userContext = useContext(UserContext);
  const user = userContext?.user;
  const navigate = useNavigate();
  const { startDownload, updateProgress, resetDownload } = useDownload();
  const [pages, setPages] = useState<PDFPage[]>([]);
  const [fullText, setFullText] = useState<string>('');
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [editedText, setEditedText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<GoogleVoice>();
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState<string>('');
  const [isShowingAuthModal, setIsShowingAuthModal] = useState(false);
  const [Document, setDocument] = useState<React.ComponentType<DocumentProps> | null>(null);
  const [Page, setPage] = useState<React.ComponentType<PageProps> | null>(null);
  const pdfLibLoadedRef = useRef(false);

  // Demo section state
  const [samplePdfData, setSamplePdfData] = useState<ArrayBuffer | null>(null);
  const [sampleNumPages, setSampleNumPages] = useState<number>(0);
  const [sampleSelectedVoice, setSampleSelectedVoice] = useState<string>('');
  const [isSampleGenerating, setIsSampleGenerating] = useState(false);
  const [sampleProgress, setSampleProgress] = useState<GenerationProgress | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<string | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const [pdfLoadError, setPdfLoadError] = useState<boolean>(false);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Voice preview states
  const [previewText, setPreviewText] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

  // PDF viewer controls
  const [pdfScale, setPdfScale] = useState<number>(() => {
    // Start at 60% for tablet (570-768px), 100% otherwise
    return window.innerWidth >= 570 && window.innerWidth < 768 ? 0.6 : 1.0;
  });
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Chirp 3 HD voices - Latest Google TTS voices (5 curated voices from different languages)
  const demoVoices = [
    { name: 'en-US-Chirp3-HD-Achernar', label: 'Emma (US English)', language: 'English', languageCode: 'en-US' },
    { name: 'pl-PL-Chirp3-HD-Achernar', label: 'Zofia (Polish)', language: 'Polish', languageCode: 'pl-PL' },
    { name: 'es-ES-Chirp3-HD-Achernar', label: 'Sofia (Spanish)', language: 'Spanish', languageCode: 'es-ES' },
    { name: 'fr-FR-Chirp3-HD-Achernar', label: 'Amelie (French)', language: 'French', languageCode: 'fr-FR' },
    { name: 'de-DE-Chirp3-HD-Achernar', label: 'Hannah (German)', language: 'German', languageCode: 'de-DE' },
  ];



  // Load PDF library and handle resize
  useEffect(() => {
    const loadPdfLibrary = async () => {
      // Load react-pdf + PDF file dynamically (desktop only)
      if (window.innerWidth >= 768 && !pdfLibLoadedRef.current) {
        pdfLibLoadedRef.current = true; // prevent re-imports

        try {
          // Dynamically import react-pdf
          const pdfModule = await import("react-pdf");
          const { pdfjs, Document: Doc, Page: Pg } = pdfModule;

          // Set PDF.js worker
          try {
            pdfjs.GlobalWorkerOptions.workerSrc = new URL(
              "pdfjs-dist/build/pdf.worker.mjs",
              import.meta.url
            ).toString();
          } catch {
            pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
          }

          // Dynamically import CSS
          await import("react-pdf/dist/Page/AnnotationLayer.css");
          await import("react-pdf/dist/Page/TextLayer.css");

          setDocument(() => Doc);
          setPage(() => Pg);
        } catch (err) {
          console.error("Failed to load PDF library:", err);
        }
      }
    };

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      loadPdfLibrary(); // Check if library needs to be loaded on resize
    };

    handleResize(); // Initial check

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty dependency array ensures this runs only once

  // Adjust PDF scale based on window width
  useEffect(() => {
    if (windowWidth >= 570 && windowWidth < 768) {
      setPdfScale(0.6);
    } else {
      setPdfScale(1.0);
    }
  }, [windowWidth]);


  // Load sample PDF for demo and extract preview text - DESKTOP ONLY
  useEffect(() => {
    // Only load PDF on desktop
    if (windowWidth >= 768) {
      // ✅ Dynamically import PDF only when needed
      import('/documents/sample.pdf?url').then((module) => {
        const samplePDF = module.default;
        setPdfUrl(samplePDF);
        setIsPdfLoading(false);

        // Defer non-critical text extraction to improve initial load performance
        const timer = setTimeout(() => {
          const extractPreview = async () => {
            try {
              const response = await fetch(samplePDF);
              const arrayBuffer = await response.arrayBuffer();
              setSamplePdfData(arrayBuffer);

              const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
              const file = new File([blob], 'sample.pdf', { type: 'application/pdf' });
              const pages = await extractTextFromPDF(file);

              if (pages.length > 0) {
                const firstPageText = pages[0].text.trim();
                const previewLength = Math.min(150, firstPageText.length);
                let preview = firstPageText.substring(0, previewLength);
                const lastSpace = preview.lastIndexOf(' ');
                if (lastSpace > 100) {
                  preview = preview.substring(0, lastSpace);
                }
                setPreviewText(preview + (preview.length < firstPageText.length ? '...' : ''));
              }
            } catch (error) {
              console.error('Failed to extract preview:', error);
            }
          };

          extractPreview();
        }, 1000);

        return () => clearTimeout(timer);
      }).catch((error) => {
        console.error('Failed to load PDF:', error);
        setIsPdfLoading(false);
      });
    } else {
      // Mobile/Tablet: Just set a default preview text without loading PDF
      setPreviewText('Transform your PDF documents into high-quality audio with AI-powered text-to-speech.');
      setIsPdfLoading(false);
    }
  }, [windowWidth]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudio) {
        previewAudio.pause();
        previewAudio.src = '';
      }
    };
  }, [previewAudio]);

  useEffect(() => {
    setFullText(pages.map(page => page.text).join('\n\n'));
  }, [editedText]);

  const handleTextExtracted = (pages: PDFPage[], file: File) => {
    setPages(pages);
    setCurrentFile(file);
    setFileSize(formatFileSize(file.size));
    if (pages.length > 0) {
      setSelectedPage(1);
      setEditedText(pages[0].text);
    }
  };

  const handlePageChange = (pageNumber: number) => {
    setSelectedPage(pageNumber);
    const pageText = pages.find(p => p.pageNumber === pageNumber)?.text || '';
    setEditedText(pageText);
    setAudioUrl('');
  };

  // PDF viewer controls handlers
  const handleZoomIn = () => {

    setPdfScale(prev => prev + 0.05);
    console.log(pdfScale)
  };

  const handleZoomOut = () => {

    setPdfScale(prev => prev - 0.05);
    console.log(pdfScale)
  };

  const handleNextPage = () => {
    if (currentPage < sampleNumPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };


  const handleGenerateAudio = async () => {
    if (!selectedVoice) {
      alert('Please select a voice first');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(null);

    try {
      const allText = pages
        .map(page => page.text)
        .join('\n\n');

      // Initialize generation and get total chunks
      const initResponse = await instanceNoAuth.post('/tts/init', {
        text: allText,
        languageCode: selectedVoice.language_code,
        voiceName: selectedVoice.name
      });
      const { totalChunks } = initResponse.data;

      setGenerationProgress({
        currentChunk: 0,
        totalChunks,
        status: 'Starting generation...'
      });

      // Generate audio chunks
      const audioChunks: ArrayBuffer[] = [];
      for (let i = 0; i < totalChunks; i++) {
        setGenerationProgress({
          currentChunk: i + 1,
          totalChunks,
          status: `Generating chunk ${i + 1} of ${totalChunks}...`
        });

        const response = await instanceNoAuth.post('/tts/synthesize-chunk', {
          text: allText,
          chunkIndex: i,
          languageCode: selectedVoice.language_code,
          voiceName: selectedVoice.name
        }, {
          responseType: 'arraybuffer'
        });
        audioChunks.push(response.data);
      }

      // Combine chunks
      setGenerationProgress({
        currentChunk: totalChunks,
        totalChunks,
        status: 'Finalizing audio...'
      });

      // Convert ArrayBuffer to base64 strings for JSON serialization
      const base64Chunks = audioChunks.map(buffer => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
      });

      const finalResponse = await instanceNoAuth.post('/tts/combine-chunks', {
        chunks: base64Chunks
      }, {
        responseType: 'arraybuffer'
      });

      const blob = new Blob([finalResponse.data], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(blob);
      setAudioUrl(audioUrl);
      downloadMP3FromBlob(blob);

      setGenerationProgress({
        currentChunk: totalChunks,
        totalChunks,
        status: 'Generation complete!'
      });
    } catch (error) {
      console.error('Error generating audio:', error);
      setGenerationProgress({
        currentChunk: 0,
        totalChunks: 0,
        status: 'Error generating audio'
      });
    } finally {
      setIsGenerating(false);
    }
  };


  // Handle voice preview
  const handlePreviewVoice = async (voiceName: string) => {
    // Update the selected voice when playing preview
    setSampleSelectedVoice(voiceName);

    // If already playing this voice, pause it
    if (isPlayingPreview === voiceName && previewAudio) {
      previewAudio.pause();
      setIsPlayingPreview(null);
      return;
    }

    // Stop any currently playing audio (don't clear src to avoid errors)
    if (previewAudio) {
      previewAudio.pause();
    }

    // Generate new preview using Google TTS
    try {
      setIsLoadingPreview(true);
      setIsPlayingPreview(voiceName);

      // Extract language code from voice name (e.g., 'en-US-Neural2-F' -> 'en-US')
      const languageCode = voiceName.slice(0, 5);

      const response = await instanceNoAuth.post('/tts/synthesize-chunk', {
        text: previewText,
        chunkIndex: 0,
        languageCode: languageCode,
        voiceName: voiceName,
        sessionId: null // No session needed for preview
      }, {
        responseType: 'arraybuffer'
      });

      const audioBlob = new Blob([response.data], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);

      audio.onplay = () => {
        setIsLoadingPreview(false);
      };

      audio.onended = () => {
        setIsPlayingPreview(null);
      };

      setPreviewAudio(audio);

      await audio.play().catch(err => {
        console.error('Error playing audio:', err);
        setIsPlayingPreview(null);
        setIsLoadingPreview(false);
      });

    } catch (error) {
      console.error('Error generating preview:', error);
      setIsPlayingPreview(null);
      setIsLoadingPreview(false);
    }
  };

  // Handle voice selection (clicking on container)
  const handleVoiceSelect = (voiceName: string) => {
    // Stop any currently playing audio
    if (previewAudio) {
      previewAudio.pause();
      setIsPlayingPreview(null);
    }
    // Select the voice
    setSampleSelectedVoice(voiceName);
  };

  // Handle convert to audio for demo
  const handleDemoConvert = async () => {
    if (!samplePdfData) {
      alert('Sample PDF is not loaded yet');
      return;
    }

    if (!sampleSelectedVoice) {
      alert('Please select a voice first');
      return;
    }

    setIsSampleGenerating(true);
    setSampleProgress(null);

    let sessionId: string | null = null;
    let isCancelled = false;
    const controllers: AbortController[] = [];

    const handleCancel = () => {
      console.log('Cancellation requested from DownloadBar');
      isCancelled = true;
    };

    // Listen for cancellation from DownloadBar
    window.addEventListener('processingCancelled', handleCancel);

    try {
      // Extract text from sample PDF
      setSampleProgress({
        currentChunk: 0,
        totalChunks: 1,
        status: 'Extracting text from PDF...'
      });

      // Convert ArrayBuffer to File
      const blob = new Blob([samplePdfData], { type: 'application/pdf' });
      const file = new File([blob], 'sample.pdf', { type: 'application/pdf' });

      const pages = await extractTextFromPDF(file);
      const allText = pages.map(page => page.text).join('\n\n');

      // Start TTS session
      setSampleProgress({
        currentChunk: 0,
        totalChunks: 1,
        status: 'Starting session...'
      });

      const sessionResponse = await instanceNoAuth.post('/tts/start-session');
      sessionId = sessionResponse.data.sessionId;
      console.log('Started new TTS session:', sessionId);

      // Split text into chunks
      const textChunks = splitTextIntoChunks(allText, 899);

      // Extract language code from voice name (e.g., 'en-US-Neural2-F' -> 'en-US')
      const languageCode = sampleSelectedVoice.slice(0, 5);

      // Get voice label for display
      const selectedVoiceObj = demoVoices.find(v => v.name === sampleSelectedVoice);
      const voiceLabel = selectedVoiceObj?.label || sampleSelectedVoice;

      // Start download bar
      startDownload(
        'Sample PDF',
        textChunks.length,
        voiceLabel,
        selectedVoiceObj?.language || 'Unknown'
      );

      setSampleProgress({
        currentChunk: 0,
        totalChunks: textChunks.length,
        status: 'Starting generation...'
      });

      const audioChunks: string[] = [];

      // Process each chunk
      for (let i = 0; i < textChunks.length; i++) {
        if (isCancelled) {
          console.log('Synthesis cancelled by user, stopping at chunk', i);
          throw new Error('Synthesis cancelled');
        }

        const controller = new AbortController();
        controllers.push(controller);

        setSampleProgress({
          currentChunk: i + 1,
          totalChunks: textChunks.length,
          status: `Generating chunk ${i + 1} of ${textChunks.length}...`
        });

        console.log(`Processing chunk ${i + 1}/${textChunks.length} for session ${sessionId}`);

        try {
          const chunkResponse = await instanceNoAuth.post('/tts/synthesize-chunk', {
            text: textChunks[i],
            chunkIndex: i,
            languageCode: languageCode,
            voiceName: sampleSelectedVoice,
            sessionId: sessionId
          }, {
            responseType: 'arraybuffer',
            signal: controller.signal
          });

          const base64Audio = arrayBufferToBase64(chunkResponse.data);
          audioChunks.push(base64Audio);
          updateProgress(i + 1);

        } catch (error: any) {
          if (error.name === 'AbortError' || error.response?.status === 499) {
            console.log('Chunk cancelled:', i + 1);
            throw new Error('Synthesis cancelled');
          }
          console.error(`Error generating chunk ${i + 1}:`, error);
          throw error;
        }
      }

      // Combine chunks
      setSampleProgress({
        currentChunk: textChunks.length,
        totalChunks: textChunks.length,
        status: 'Finalizing audio...'
      });

      console.log(`Combining ${audioChunks.length} chunks for session ${sessionId}`);

      const combineController = new AbortController();
      controllers.push(combineController);

      const finalResponse = await instanceNoAuth.post('/tts/combine-chunks', {
        chunks: audioChunks,
        sessionId: sessionId
      }, {
        responseType: 'arraybuffer',
        signal: combineController.signal,
        headers: {
          'Accept': 'audio/mpeg'
        }
      });

      const audioBlob = new Blob([finalResponse.data], { type: 'audio/mpeg' });
      downloadMP3FromBlob(audioBlob);

      setSampleProgress({
        currentChunk: textChunks.length,
        totalChunks: textChunks.length,
        status: 'Download started!'
      });

      resetDownload();

      // Clear progress after 3 seconds
      setTimeout(() => setSampleProgress(null), 3000);
    } catch (error: any) {
      resetDownload();

      if (error.message === 'Synthesis cancelled') {
        console.log('Synthesis was cancelled by user');
        setSampleProgress({
          currentChunk: 0,
          totalChunks: 0,
          status: 'Cancelled'
        });
        setTimeout(() => setSampleProgress(null), 2000);
      } else {
        console.error('Error generating demo audio:', error);
        setSampleProgress({
          currentChunk: 0,
          totalChunks: 0,
          status: 'Error generating audio'
        });
      }
    } finally {
      setIsSampleGenerating(false);

      // Clean up event listener
      window.removeEventListener('processingCancelled', handleCancel);

      // Clean up controllers
      controllers.forEach(controller => {
        try {
          controller.abort();
        } catch (error) {
          console.log('Controller already aborted:', error);
        }
      });
    }
  };


  const handleBait = () => {

  }

  return (
    <>
      {/* React 19 Native Metadata */}
      <title>PDF to Audio - Convert Documents to Speech with AI Voices | PDF to Audio</title>
      <meta name="title" content="PDF to Audio - Convert Documents to Speech with AI Voices | PDF to Audio" />
      <meta name="description" content="Transform your PDF documents into high-quality audio with AI-powered text-to-speech. Try free demo with Azure and Google voices. Upload, listen, and download MP3s." />
      <meta name="keywords" content="PDF to audio, text to speech, PDF reader, audiobook converter, AI voice, read aloud, document to audio, Azure TTS, Google TTS, free TTS" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={domain} />
      <meta property="og:title" content="PDF to Audio - Convert Documents to Speech with AI Voices | PDF to Audio" />
      <meta property="og:description" content="Transform your PDF documents into high-quality audio with AI-powered text-to-speech. Try free demo with Azure and Google voices. Upload, listen, and download MP3s." />
      <meta property="og:image" content={`${domain}/l.png`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={domain} />
      <meta property="twitter:title" content="PDF to Audio - Convert Documents to Speech with AI Voices | PDF to Audio" />
      <meta property="twitter:description" content="Transform your PDF documents into high-quality audio with AI-powered text-to-speech. Try free demo with Azure and Google voices. Upload, listen, and download MP3s." />
      <meta property="twitter:image" content={`${domain}/l.png`} />

      {/* Canonical URL */}
      <link rel="canonical" href={domain} />

      {/* How It Works - JSON-LD */}
      <script type="application/ld+json">
        {`
          {
            "@context": "https://schema.org",
            "@type": "HowTo",
            "name": "How to Convert PDF to Audio",
            "description": "Transform your documents into audio in three simple steps.",
            "step": [
              {
                "@type": "HowToStep",
                "name": "Upload Document",
                "text": "Upload PDF, DOCX, EPUB, or TXT files. Our system supports multiple formats.",
                "position": 1
              },
              {
                "@type": "HowToStep",
                "name": "Choose Your Voice",
                "text": "Select from over 50 natural-sounding AI voices in multiple languages and accents.",
                "position": 2
              },
              {
                "@type": "HowToStep",
                "name": "Listen or Download",
                "text": "Listen online with read-along highlighting or download MP3 files for offline listening.",
                "position": 3
              }
            ]
          }
        `}
      </script>

      {/* FAQ - JSON-LD */}
      <script type="application/ld+json">
        {`
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What file formats are supported?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "We support PDF, DOCX, EPUB, and TXT files. Simply upload your document and we'll handle the rest. Most common document formats are compatible with our platform."
                }
              },
              {
                "@type": "Question",
                "name": "How many voices are available?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "We offer over 50 natural-sounding AI voices powered by Google and Azure Text-to-Speech. Choose from multiple languages, accents, and voice styles to find the perfect match for your content."
                }
              },
              {
                "@type": "Question",
                "name": "Can I use this for commercial purposes?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes! You can create audio content for your business, courses, podcasts, or any other commercial application."
                }
              },
              {
                "@type": "Question",
                "name": "How long does the conversion take?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Conversion time depends on document length. A typical 10-page document takes 2-3 minutes. Our system processes documents in real-time with progress updates throughout."
                }
              },
              {
                "@type": "Question",
                "name": "Is my data secure and private?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Absolutely. We use enterprise-grade encryption for all uploads. Your documents are processed in real-time and never permanently stored on our servers. We take your privacy seriously."
                }
              }
            ]
          }
        `}
      </script>

      <div className={styles.container}>
        <div className={styles.mainContent}>
          <header className={styles.header}>
            <h1>Convert PDF to Audio with AI Text-to-Speech</h1>
            <p>Transform documents into natural-sounding audio. Listen to PDFs, books, and articles on the go.</p>
          </header>

          {/* Demo Section */}
          <section className={styles.demoSection}>
            <h2 className={styles.demoHeading}>See It In Action</h2>
            <div className={styles.demoContainer}>
              {/* Conditional rendering based on screen width */}
              {windowWidth < 768 ? (
                // Vertical Card Layout for mobile and tablet (0px - 768px)
                <div className={styles.verticalCardLayout}>
                  <div className={styles.documentCard}>
                    <div className={styles.documentCardHeader}>
                      <span className={styles.documentIcon}><FileText size={24} /></span>
                      <h3 className={styles.documentTitle}>Sample.pdf</h3>
                    </div>

                    {/* Only show PDF thumbnail on tablet (570px - 768px) */}
                    {windowWidth >= 570 && (
                      <>
                        {/* PDF Toolbar for Tablet */}
                        <div className={styles.pdfToolbar}>
                          <div className={styles.zoomControls}>
                            <button
                              className={styles.toolbarButton}
                              onClick={handleZoomOut}
                              disabled={pdfScale <= 0.5}
                              title="Zoom out"
                            >
                              🔍−
                            </button>
                            <span className={styles.zoomLevel}>{Math.round(pdfScale * 100)}%</span>
                            <button
                              className={styles.toolbarButton}
                              onClick={handleZoomIn}
                              disabled={pdfScale >= 2.0}
                              title="Zoom in"
                            >
                              🔍+
                            </button>
                          </div>
                          <div className={styles.pageControls}>
                            <button
                              className={styles.toolbarButton}
                              onClick={handlePrevPage}
                              disabled={currentPage <= 1}
                              title="Previous page"
                            >
                              ←
                            </button>
                            <span className={styles.pageIndicator}>
                              {currentPage} / {sampleNumPages || 1}
                            </span>
                            <button
                              className={styles.toolbarButton}
                              onClick={handleNextPage}
                              disabled={currentPage >= (sampleNumPages || 1)}
                              title="Next page"
                            >
                              →
                            </button>
                          </div>
                        </div>

                        {/* <div className={styles.documentPreview}>
                          {pdfUrl ? (
                            <Document
                              key="sample-pdf-card"
                              file={pdfUrl}
                              onLoadSuccess={({ numPages }) => setSampleNumPages(numPages)}
                              onLoadError={(error) => {
                                console.error('PDF load error:', error);
                                setPdfLoadError(true);
                              }}
                              loading={<div className={styles.pdfLoading}>Loading PDF...</div>}
                              error={<div className={styles.pdfLoading}>Failed to load PDF</div>}
                            >
                              <div className={styles.pdfDocumentCard}>
                                <Page
                                  key={`card-page-${currentPage}-scale-${pdfScale}`}
                                  pageNumber={currentPage}
                                  scale={pdfScale}
                                  renderTextLayer={true}

                                  renderAnnotationLayer={false}
                                  loading={<div className={styles.pdfLoading}>Loading page...</div>}
                                  error={<div className={styles.pdfLoading}>Error loading page</div>}
                                />
                              </div>
                            </Document>
                          ) : isPdfLoading ? (
                            <div className={styles.pdfLoading}>Loading...</div>
                          ) : (
                            <div className={styles.pdfLoading}>PDF not available</div>
                          )}
                        </div> */}
                      </>
                    )}

                    <div className={styles.documentInfo}>
                      <h4 className={styles.documentInfoTitle}>The Future of AI in Education</h4>
                      <div className={styles.documentMeta}>
                        <span>📑 {sampleNumPages || 2} pages</span>
                        <span>📝 ~1,250 words</span>
                        <span>🌐 English</span>
                      </div>
                    </div>

                    {/* Voice Selector for Mobile/Tablet */}
                    <div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#67e8f9', marginBottom: '1rem' }}>
                        Select a Voice
                      </h3>
                      <div className={styles.voiceList}>
                        {demoVoices.map((voice) => (
                          <div
                            key={voice.name}
                            className={`${styles.voiceOption} ${sampleSelectedVoice === voice.name ? styles.selected : ''
                              } ${isPlayingPreview === voice.name ? styles.playing : ''}`}
                            onClick={() => handleVoiceSelect(voice.name)}
                          >
                            <div className={styles.voiceInfo}>
                              <div className={styles.voiceName}>{voice.label}</div>
                              <div className={styles.voiceLanguage}>{voice.language}</div>
                            </div>
                            <button
                              className={styles.previewButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewVoice(voice.name);
                              }}
                              disabled={isLoadingPreview && isPlayingPreview === voice.name}
                            >
                              {isLoadingPreview && isPlayingPreview === voice.name
                                ? '⏳'
                                : isPlayingPreview === voice.name
                                  ? '⏸️'
                                  : '▶️'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.documentActions}>
                      <button
                        className={styles.listenButton}
                        onClick={() => navigate('/reader/sample')}
                      >
                        <Headphones size={16} /> Listen Now
                      </button>
                      {windowWidth >= 768 &&
                        <button
                          className={styles.convertButton}
                          onClick={handleDemoConvert}
                          disabled={isSampleGenerating}
                        >
                          Convert
                          {/* {isSampleGenerating ? '⏳ Converting...' : '🎵 Convert to Audio'} */}
                        </button>
                      }
                    </div>

                    {sampleProgress &&
                      null
                    }
                  </div>
                </div>
              ) : (
                // Desktop layout (768px+) - PDF viewer + Voice controls
                <>
                  {/* Left Column - Document Info + PDF Viewer */}
                  <div className={styles.leftColumn}>
                    {/* Document Info - Compact for Desktop */}
                    <div className={styles.docInfoCompact}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(user ? '/dashboard' : '/register')}
                    >
                      <div className={styles.docInfoHeader}>
                        <span className={styles.docIconSmall}>📄</span>
                        <div className={styles.docInfoText}>
                          <h4 className={styles.docName}>Sample.pdf</h4>
                          <p className={styles.docDetails}>{sampleNumPages || 2} pages • ~1,250 words • English</p>
                        </div>
                      </div>
                    </div>

                    {/* PDF Viewer */}
                    <div className={styles.demoPdfViewer}>
                      {/* PDF Toolbar */}
                      <div className={styles.pdfToolbar}>
                        <div className={styles.zoomControls}>
                          <button
                            className={styles.toolbarButton}
                            onClick={handleZoomOut}
                            disabled={pdfScale <= 0.5}
                            title="Zoom out"
                          >
                            🔍−
                          </button>
                          <span className={styles.zoomLevel}>{Math.round(pdfScale * 100)}%</span>
                          <button
                            className={styles.toolbarButton}
                            onClick={handleZoomIn}
                            disabled={pdfScale === 1.0}
                            title="Zoom in"
                          >
                            🔍+
                          </button>
                        </div>

                        <div className={styles.pageControls}>
                          <button
                            className={styles.toolbarButton}
                            onClick={handlePrevPage}
                            disabled={currentPage <= 1}
                            title="Previous page"
                          >
                            ←
                          </button>
                          <span className={styles.pageIndicator}>
                            {currentPage}  / {sampleNumPages || 1}
                          </span>
                          <button
                            className={styles.toolbarButton}
                            onClick={handleNextPage}
                            disabled={currentPage >= sampleNumPages}
                            title="Next page"
                          >
                            →
                          </button>
                        </div>
                      </div>

                      {/* PDF Document */}
                      <div className={styles.pdfScrollContainer}>
                        {pdfUrl && Document && Page ? (
                          <Document
                            key="sample-pdf-viewer"
                            file={pdfUrl}
                            onLoadSuccess={({ numPages }) => {
                              setSampleNumPages(numPages);
                              setCurrentPage(1);
                            }}
                            onLoadError={(error) => {
                              console.error('PDF load error:', error);
                              setPdfLoadError(true);
                            }}
                            loading={<div className={styles.pdfLoading}>Loading PDF...</div>}
                            error={<div className={styles.pdfLoading}>Failed to load PDF. Please refresh the page.</div>}
                          >
                            <div className={styles.pdfDocument}>
                              <Page
                                pageNumber={currentPage}
                                scale={pdfScale}
                                renderTextLayer={true}
                                renderAnnotationLayer={false}
                                loading={<div className={styles.pdfLoading}>Loading page...</div>}
                                error={<div className={styles.pdfLoading}>Error loading page</div>}
                              />
                            </div>
                          </Document>
                        ) : isPdfLoading ? (
                          <div className={styles.pdfLoading}>Loading sample document...</div>
                        ) : (
                          <div className={styles.pdfLoading}>PDF not available. Please refresh the page.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Voice Controls */}
                  <div className={styles.demoControls}>
                    <h3>Select a Voice</h3>
                    <div className={styles.voiceList}>
                      {demoVoices.map((voice) => (
                        <div
                          key={voice.name}
                          className={`${styles.voiceOption} ${sampleSelectedVoice === voice.name ? styles.selected : ''
                            } ${isPlayingPreview === voice.name ? styles.playing : ''}`}
                          onClick={() => handleVoiceSelect(voice.name)}
                        >
                          <div className={styles.voiceInfo}>
                            <div className={styles.voiceName}>{voice.label}</div>
                            <div className={styles.voiceLanguage}>{voice.language}</div>
                          </div>
                          <button
                            className={styles.previewButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewVoice(voice.name);
                            }}
                            disabled={isLoadingPreview && isPlayingPreview === voice.name}
                          >
                            {isLoadingPreview && isPlayingPreview === voice.name
                              ? '⏳'
                              : isPlayingPreview === voice.name
                                ? '⏸️'
                                : '▶️'}
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className={styles.demoActions}>
                      <button
                        className={styles.listenButton}
                        onClick={() => navigate('/reader/sample')}
                      >
                        Listen
                      </button>
                      <button
                        className={styles.convertButton}
                        onClick={handleDemoConvert}
                        disabled={isSampleGenerating}
                      >
                        Convert
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* How It Works Section */}
          <section className={styles.howItWorksSection}>
            <h2 className={styles.sectionTitle}>How It Works</h2>
            <p className={styles.sectionSubtitle}>Transform your documents into audio in three simple steps</p>
            <div className={styles.stepsContainer}>
              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepIcon}><Upload size={32} /></div>
                <h3>Upload Document</h3>
                <p>Upload PDF, DOCX, EPUB, or TXT files. Our system supports multiple formats</p>
              </div>
              <div className={styles.stepArrow}>→</div>
              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepIcon}><Music size={32} /></div>
                <h3>Choose Your Voice</h3>
                <p>Select from over 50 natural-sounding AI voices in multiple languages and accents.</p>
              </div>
              <div className={styles.stepArrow}>→</div>
              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepIcon}><Headphones size={32} /></div>
                <h3>Listen or Download</h3>
                <p>Listen online with read-along highlighting or download MP3 files for offline listening.</p>
              </div>
            </div>
          </section>

          {/* Features Grid Section */}
          <section className={styles.featuresGridSection}>
            <h2 className={styles.sectionTitle}>Powerful Features</h2>
            <p className={styles.sectionSubtitle}>Everything you need to convert documents to audio</p>
            <div className={styles.featuresGrid}>
              <div className={styles.featureGridCard}>
                <div className={styles.featureGridIcon}><Globe size={32} /></div>
                <h3>Multi-Language Support</h3>
                <p>Support for 40+ languages including English, Spanish, French, German, Chinese, and more.</p>
              </div>
              <div className={styles.featureGridCard}>
                <div className={styles.featureGridIcon}><Zap size={32} /></div>
                <h3>Lightning Fast</h3>
                <p>Convert documents in minutes with our high-speed processing engine.</p>
              </div>
              <div className={styles.featureGridCard}>
                <div className={styles.featureGridIcon}><FileText size={32} /></div>
                <h3>Read-Along Highlighting</h3>
                <p>Follow along with synchronized text highlighting as the audio plays.</p>
              </div>
              <div className={styles.featureGridCard}>
                <div className={styles.featureGridIcon}><Music size={32} /></div>
                <h3>Downloadable MP3s</h3>
                <p>Download high-quality MP3 files to listen anywhere, anytime.</p>
              </div>
              <div className={styles.featureGridCard}>
                <div className={styles.featureGridIcon}><Lock size={32} /></div>
                <h3>Secure & Private</h3>
                <p>Your documents are encrypted and never stored on our servers.</p>
              </div>
              <div className={styles.featureGridCard}>
                <div className={styles.featureGridIcon}><Briefcase size={32} /></div>
                <h3>Mobile Friendly</h3>
                <p>Works perfectly on desktop, tablet, and mobile devices.</p>
              </div>
            </div>
          </section>

          {/* Use Cases Section */}
          <section className={styles.useCasesSection}>
            <h2 className={styles.sectionTitle}>Perfect For Everyone</h2>
            <p className={styles.sectionSubtitle}>See how different people use our platform</p>
            <div className={styles.useCasesGrid}>
              <div className={styles.useCaseCard}>
                <div className={styles.useCaseIcon}><BookOpen size={40} /></div>
                <h3>Students & Learners</h3>
                <p>Listen to textbooks and study materials while commuting, exercising, or multitasking. Perfect for auditory learners.</p>
                <ul className={styles.useCaseList}>
                  <li>Convert textbooks to audio</li>
                  <li>Study on the go</li>
                  <li>Improve retention with audio learning</li>
                </ul>
              </div>
              <div className={styles.useCaseCard}>
                <div className={styles.useCaseIcon}><Briefcase size={40} /></div>
                <h3>Business Professionals</h3>
                <p>Stay on top of reports, whitepapers, and research while driving or during your daily routine.</p>
                <ul className={styles.useCaseList}>
                  <li>Listen to industry reports</li>
                  <li>Review documents hands-free</li>
                  <li>Save time and boost productivity</li>
                </ul>
              </div>
              <div className={styles.useCaseCard}>
                <div className={styles.useCaseIcon}><Headphones size={40} /></div>
                <h3>Content Creators</h3>
                <p>Transform written content into engaging audio for podcasts, audiobooks, or social media.</p>
                <ul className={styles.useCaseList}>
                  <li>Create audiobook versions</li>
                  <li>Produce podcast content</li>
                  <li>Expand your audience reach</li>
                </ul>
              </div>
              <div className={styles.useCaseCard}>
                <div className={styles.useCaseIcon}><Globe size={40} /></div>
                <h3>Accessibility Champions</h3>
                <p>Make written content accessible for people with visual impairments, dyslexia, or reading difficulties.</p>
                <ul className={styles.useCaseList}>
                  <li>Support visually impaired users</li>
                  <li>Help with dyslexia and reading challenges</li>
                  <li>Provide inclusive content formats</li>
                </ul>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section className={styles.faqSection}>
            <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
            <div className={styles.faqContainer}>
              <div className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>What file formats are supported?</h3>
                <p className={styles.faqAnswer}>
                  We support PDF, DOCX, EPUB, and TXT files. Simply upload your document and we'll handle the rest. Most common document formats are compatible with our platform.
                </p>
              </div>
              <div className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>How many voices are available?</h3>
                <p className={styles.faqAnswer}>
                  We offer over 50 natural-sounding AI voices powered by Google and Azure Text-to-Speech. Choose from multiple languages, accents, and voice styles to find the perfect match for your content.
                </p>
              </div>
              {/* <div className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>Is there a file size limit?</h3>
                <p className={styles.faqAnswer}>
                  Free accounts can convert files up to 5MB. Premium accounts have higher limits based on your plan. Large documents are automatically split into manageable chunks for processing.
                </p>
              </div> */}
              <div className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>Can I use this for commercial purposes?</h3>
                <p className={styles.faqAnswer}>
                  Yes! You can create audio content for your business, courses, podcasts, or any other commercial application.
                </p>
              </div>
              <div className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>How long does the conversion take?</h3>
                <p className={styles.faqAnswer}>
                  Conversion time depends on document length. A typical 10-page document takes 2-3 minutes. Our system processes documents in real-time with progress updates throughout.
                </p>
              </div>
              <div className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>Is my data secure and private?</h3>
                <p className={styles.faqAnswer}>
                  Absolutely. We use enterprise-grade encryption for all uploads. Your documents are processed in real-time and never permanently stored on our servers. We take your privacy seriously.
                </p>
              </div>
            </div>
          </section>

          {/* Call to Action Section */}
          <section className={styles.ctaSection}>
            <div className={styles.ctaContent}>
              <h2>Start Converting PDFs to Audio Today</h2>
              <p>Join thousands of users transforming documents into audiobooks with AI text-to-speech technology.</p>
              <div className={styles.ctaButtons}>
                {user ? (
                  <Link to="/dashboard" className={styles.ctaPrimary}>
                    Go to Dashboard
                  </Link>
                ) : (
                  <>
                    <Link to="/register" className={styles.ctaPrimary}>
                      Get Started Free
                    </Link>
                    <Link to="/pricing" className={styles.ctaSecondary}>
                      View Pricing
                    </Link>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Testimonials Section - Enhanced */}
          <section className={styles.testimonialsEnhanced}>
            <h2 className={styles.sectionTitle}>What Our Users Say</h2>
            <p className={styles.sectionSubtitle}>Trusted by students, professionals, and content creators worldwide</p>
            <div className={styles.testimonialGrid}>
              <div className={styles.testimonialCard}>
                <div className={styles.stars}>⭐⭐⭐⭐⭐</div>
                <p className={styles.quote}>
                  "This tool has revolutionized how I study. I can listen to my textbooks while commuting and it's improved my grades significantly!"
                </p>
                <div className={styles.testimonialAuthor}>
                  <div className={styles.authorAvatar}>SJ</div>
                  <div>
                    <p className={styles.authorName}>Sarah Johnson</p>
                    <p className={styles.authorRole}>Medical Student</p>
                  </div>
                </div>
              </div>
              <div className={styles.testimonialCard}>
                <div className={styles.stars}>⭐⭐⭐⭐⭐</div>
                <p className={styles.quote}>
                  "As someone with dyslexia, this app has been life-changing. I can finally enjoy reading without the struggle."
                </p>
                <div className={styles.testimonialAuthor}>
                  <div className={styles.authorAvatar}>MC</div>
                  <div>
                    <p className={styles.authorName}>Michael Chen</p>
                    <p className={styles.authorRole}>Software Engineer</p>
                  </div>
                </div>
              </div>
              <div className={styles.testimonialCard}>
                <div className={styles.stars}>⭐⭐⭐⭐⭐</div>
                <p className={styles.quote}>
                  "We've reduced our audio content production time by 90%. The voice quality is incredible and our audience loves it."
                </p>
                <div className={styles.testimonialAuthor}>
                  <div className={styles.authorAvatar}>AR</div>
                  <div>
                    <p className={styles.authorName}>Amanda Rodriguez</p>
                    <p className={styles.authorRole}>Content Director</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {isShowingAuthModal && (
            <div className={styles.authModal}>
              <div className={styles.authModalContent}>
                <button className={styles.closeModal} onClick={() => setIsShowingAuthModal(false)}>×</button>
                <svg className={styles.lockIcon} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                </svg>
                <h2>Create Account to Generate MP3</h2>
                <p>Unlock full access to generate and download MP3 files of your documents.</p>
                <div className={styles.authButtons}>
                  <Link to="/register" className={styles.primaryButton}>Create Free Account</Link>
                  <Link to="/login" className={styles.secondaryButton}>Sign In</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}