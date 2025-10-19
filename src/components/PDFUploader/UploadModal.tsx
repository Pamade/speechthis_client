import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './UploadModal.module.scss';
import { useGetGoogleVoices } from '../../customHooks/useGetGoogleVoices';
import { usePlaySample } from '../../customHooks/usePlaySample';
import { instance, instanceNoAuth } from '../../utils/axiosInstance';
import { useDownload } from '../../context/DownloadContext';
import toast from 'react-hot-toast';
import { extractTextFromPDF } from '../../utils/pdfUtils';
import { extractTextFromDOCX } from '../../utils/docxUtils';
import { extractTextFromEPUB } from '../../utils/epubUtils';

interface UploadModalProps {
    onClose: () => void;
    onUploadComplete?: () => void;
    isGenerating?: boolean;
    transfer: number;
}

export function UploadModal({ onClose, onUploadComplete, isGenerating = false, transfer }: UploadModalProps) {
    const { startDownload, updateProgress, resetDownload } = useDownload();

    const {
        languages,
        genders,
        filteredVoices,
        selectedLanguage,
        setSelectedLanguage,
        selectedGender,
        setSelectedGender,
        selectedVoice,
        handleVoiceSelect,
    } = useGetGoogleVoices();

    const [languageChanged, setLanguageChanged] = useState(false);
    const [genderChanged, setGenderChanged] = useState(false);



    // Handle voice selection when language changes
    useEffect(() => {
        if (selectedLanguage && languageChanged) {
            const firstVoice = filteredVoices.find(voice => voice.language === selectedLanguage);
            if (firstVoice && firstVoice.name !== selectedVoice?.name) {
                handleVoiceSelect(firstVoice);
            }
            setLanguageChanged(false);
        }
    }, [selectedLanguage, filteredVoices, languageChanged]);

    // Handle voice selection when gender changes
    useEffect(() => {
        if (selectedGender && genderChanged) {
            const firstVoice = filteredVoices.find(voice => voice.gender === selectedGender);
            if (firstVoice && firstVoice.name !== selectedVoice?.name) {
                handleVoiceSelect(firstVoice);
            }
            setGenderChanged(false);
        }
    }, [selectedGender, filteredVoices, genderChanged]);

    const {
        isSamplePlaying,
        isPreparing,
        handleSampleButtonClick,
        stopSamplePlayback
    } = usePlaySample();

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileContent, setFileContent] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [disabledAfterCancel, setDisabledAfterCancel] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        stopSamplePlayback();
        setIsLoading(true);
        setSelectedFile(file);

        // Calculate file size in MB
        try {
            if (file.type === 'text/plain') {
                // Handle text files
                const content = await file.text();
                setFileContent(content.trim());

            }
            else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                const data = await extractTextFromDOCX(file);
                setFileContent(data);
            }
            else if (file.type === "application/epub+zip") {
                const data = await extractTextFromEPUB(file);
                setFileContent(data)
            }
            else if (file.type === 'application/pdf') {
                const pages = await extractTextFromPDF(file);
                const allText = pages.map(page => page.text).join('\n\n');
                setFileContent(allText);
            } else {
                setFileContent('This file type is not supported yet.');
            }
        } catch (error) {
            console.error('Error reading file:', error);
            toast.error('Error reading file');
        } finally {
            setIsLoading(false);
        }
    };

    console.log(filteredVoices)

    const handleSubmit = async () => {
        if (!selectedFile || !selectedVoice || !fileContent) return;

        // Close the modal immediately when upload starts
        onClose();

        // Create a text file from the extracted content
        const blob = new Blob([fileContent], { type: "text/plain" });
        const textFile = new File([blob], `${selectedFile.name.split('.')[0]}.txt`, { type: "text/plain" });

        // Calculate file size in MB before upload
        const fileSizeInMB = selectedFile.size / (1024 * 1024);

        if (fileSizeInMB === 0) {
            toast.error('File appears to be empty. Please choose another file.');
            return;
        }

        // Check if user has sufficient transfer before starting conversion
        if (fileSizeInMB > transfer) {
            toast.error(`Not enough available transfer. Need ${fileSizeInMB.toFixed(2)}MB but only have ${transfer.toFixed(2)}MB available.`);
            return;
        }

        try {
            setIsProcessing(true);
            // Create FormData with all necessary information
            const formData = new FormData();
            formData.append("file", textFile);
            formData.append("language", selectedVoice.originalLanguageCode || selectedVoice.language_code);
            formData.append("gender", selectedVoice.originalGender || selectedGender);
            formData.append("voice", selectedVoice.name);
            formData.append("originalFileSize", String(textFile.size));

            console.log(formData)
            // First, upload the file
            const uploadResponse = await instance.post("/files/upload", formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (uploadResponse.data) {
                console.log('Upload response:', uploadResponse.data);
                const responseData = uploadResponse.data;

                // Start the TTS conversion process
                await handleTTSConversion(
                    responseData.id,
                    fileSizeInMB,
                    responseData
                );
            }
        } catch (error) {
            console.error('Upload failed:', error);
            alert("")
            toast.error('Failed to upload file. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    // TTS Conversion function
    const handleTTSConversion = async (_textId: number, fileSize: number, textData: any) => {
        let isCancelled = false;
        const controllers: AbortController[] = [];
        let sessionId: string | null = null;

        const handleCancel = () => {
            console.log('Cancellation requested from DownloadBar');
            isCancelled = true;
        };

        // Listen for cancellation from DownloadBar
        window.addEventListener('processingCancelled', handleCancel);

        try {
            // Start TTS session
            const sessionResponse = await instanceNoAuth.post('/tts/start-session');
            sessionId = sessionResponse.data.sessionId;
            console.log('Started new TTS session:', sessionId);

            // Get the text content from the uploaded file
            let actualTextContent = '';
            try {
                const textResponse = await instance.get(`/files/text/${textData.id}/stream`);
                actualTextContent = textResponse.data;
                actualTextContent = actualTextContent.trim();

                if (!actualTextContent) {
                    throw new Error('Text content is empty');
                }
            } catch (error) {
                console.error('Error fetching text content:', error);
                toast.error('Error loading text content. Please try again.');
                return;
            }

            // Split text into chunks for TTS processing
            const textChunks = splitTextIntoChunks(actualTextContent, 899);

            startDownload(
                textData.documentName.split('/').pop()?.replace('.txt', '') || 'File',
                textChunks.length,
                textData.voice,
                textData.language
            );

            const audioChunks: string[] = [];

            // Process each chunk
            for (let i = 0; i < textChunks.length; i++) {
                if (isCancelled) {
                    console.log('Synthesis cancelled by user, stopping at chunk', i);
                    throw new Error('Synthesis cancelled');
                }

                const controller = new AbortController();
                controllers.push(controller);

                try {
                    console.log(`Processing chunk ${i + 1}/${textChunks.length} for session ${sessionId}`);

                    const chunkResponse = await instanceNoAuth.post('/tts/synthesize-chunk', {
                        text: textChunks[i],
                        chunkIndex: i,
                        languageCode: textData.voice.slice(0, 5),
                        voiceName: textData.voice,
                        sessionId: sessionId
                    }, {
                        responseType: "arraybuffer",
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

            console.log(`Combining ${audioChunks.length} chunks for session ${sessionId}`);

            // Combine all audio chunks
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

            const audioBlob = new Blob([finalResponse.data], {
                type: 'audio/mpeg'
            });

            const fileName = textData.documentName.split('/').pop()?.replace(/\.(txt|pdf|docx)$/, '') || 'audio';
            const file = new File([audioBlob], `${fileName}.mp3`, {
                type: 'audio/mpeg'
            });

            const formData = new FormData();
            formData.append('audioFile', file);
            formData.append('cloudinaryTextId', String(textData.id));

            // Upload the generated audio file
            const audioUploadResponse = await instance.post('/files/upload-mp3', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            // Remove transfer from user's balance
            await instance.patch('/available_transfer/remove-transfer', null, {
                params: {
                    transferToRemove: fileSize
                }
            });

            // Send email notification
            // const loadingToast = toast.loading('Sending audio file to your email...', {
            //     position: 'top-center'
            // });

            try {
                // Use the audioId from the upload response
                if (audioUploadResponse.data && audioUploadResponse.data.audioId) {
                    const audioId = audioUploadResponse.data.audioId;
                    await instance.post(`/files/notify-audio-ready/${audioId}`, {});
                } else {
                    throw new Error('No audioId received from upload response');
                }

                // toast.dismiss(loadingToast);
                toast.success('Audio file has been sent to your email!', {
                    duration: 4000,
                    position: 'top-center'
                });
            } catch (e) {
                // toast.dismiss(loadingToast);
                alert("")
                toast.error('Failed to send audio file to email. Please try again.', {
                    duration: 4000,
                    position: 'top-center'
                });
                console.error("Email sending failed:", e);
            }

            resetDownload();
            onClose();

            // Call completion handler to refresh the dashboard
            if (onUploadComplete) {
                onUploadComplete();
            }

        } catch (error: any) {
            resetDownload();

            if (error.message === 'Synthesis cancelled') {
                console.log('Synthesis was cancelled by user');
                toast.success('Synthesis cancelled', {
                    duration: 3000,
                    position: 'top-center'
                });
                // Inform the app that cancellation has been finalized (toast shown)
                window.dispatchEvent(new CustomEvent('synthesisCancelled'));
                // Temporarily disable the upload button while cancellation settles
                setDisabledAfterCancel(true);
                setTimeout(() => setDisabledAfterCancel(false), 3000);
            } else {
                console.error('Synthesis error:', error);
                toast.error('Synthesis failed. Please try again.', {
                    duration: 4000,
                    position: 'top-center'
                });
            }
        } finally {
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

    // Helper function to split text into chunks
    const splitTextIntoChunks = (text: string, maxBytes = 899): string[] => {
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
    };

    // Helper function to convert ArrayBuffer to base64
    function arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
        }
        return btoa(binary);
    }

    return (
        <div className={styles.modal}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <h2>Upload</h2>
                    <button onClick={() => {
                        stopSamplePlayback();
                        onClose();
                    }} className={styles.closeButton}>×</button>
                </div>

                <div className={styles.infoSection}>
                    <div className={styles.infoText}>
                        After successful generation, the file will be:
                        <ul>
                            <li>Automatically downloaded to your computer</li>
                            <li>Transfer will be taken from your available balance</li>
                        </ul>
                    </div>
                </div>

                <div className={styles.modalBody}>
                    <div className={styles.uploadSection}>
                        <input
                            type="file"
                            accept=".txt,.pdf,.docx,.epub"
                            onChange={handleFileChange}
                            className={styles.fileInput}
                        />
                        {selectedFile && (
                            <div>
                                <p className={styles.fileName}>Selected: {selectedFile.name}</p>
                                <p className={`${styles.fileSize} ${selectedFile.size / (1024 * 1024) > transfer ? styles.insufficientTransfer : ''}`}>
                                    Size: {(selectedFile.size / (1024 * 1024)).toFixed(2)}MB
                                    {selectedFile.size / (1024 * 1024) > transfer && ' (Exceeds available transfer)'}
                                </p>
                            </div>
                        )}
                        {isLoading && (
                            <div className={styles.loading}>
                                Generating...
                            </div>
                        )}
                    </div>

                    <div className={styles.voiceSettings}>
                        <div className={styles.settingGroup}>
                            <label>Language</label>
                            <select
                                value={selectedLanguage}
                                onChange={(e) => {
                                    stopSamplePlayback();
                                    setSelectedLanguage(e.target.value);
                                    setLanguageChanged(true);
                                }}
                            >
                                {languages.map((language) => (
                                    <option key={language} value={language}>
                                        {language}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.settingGroup}>
                            <label>Gender</label>
                            <select
                                value={selectedGender}
                                onChange={(e) => {
                                    stopSamplePlayback();
                                    setSelectedGender(e.target.value);
                                    setGenderChanged(true);
                                }}
                            >
                                {genders.map((gender) => (
                                    <option key={gender} value={gender}>
                                        {gender}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.settingGroup}>
                            <label>Voice</label>
                            <select
                                value={selectedVoice?.name || ''}
                                onChange={(e) => {
                                    stopSamplePlayback();
                                    const selected = filteredVoices.find(voice => voice.name === e.target.value);
                                    if (selected) handleVoiceSelect(selected);
                                }}
                            >
                                {filteredVoices.map((voice) => (
                                    <option key={voice.name} value={voice.name}>
                                        {voice.friendlyName || voice.name} ({voice.gender})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {fileContent && (
                        <div className={styles.textPreview}>
                            <div className={styles.textAreaHeader}>
                                <button
                                    className={`${styles.playButton} ${isPreparing ? styles.preparing : ''}`}
                                    onClick={() => {
                                        if (isSamplePlaying) {
                                            stopSamplePlayback();
                                        } else if (selectedVoice && fileContent) {
                                            handleSampleButtonClick(fileContent.slice(0, 500), selectedVoice);
                                        }
                                    }}
                                    disabled={!selectedVoice || !fileContent || isPreparing || isGenerating}
                                >
                                    {isPreparing ? (
                                        'Preparing...'
                                    ) : isSamplePlaying ? (
                                        'Reading...'
                                    ) : (
                                        'Read Preview'
                                    )}
                                </button>
                            </div>
                            <div className={styles.textContent} style={{
                                overflowX: 'hidden',
                                whiteSpace: 'pre-wrap',
                                wordWrap: 'break-word'
                            }}>
                                {fileContent}
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.modalFooter}>
                    <button
                        className={`${styles.button} ${styles.secondaryButton}`}
                        onClick={() => {
                            stopSamplePlayback();
                            onClose();
                        }}
                    >
                        Cancel
                    </button>
                    {selectedFile ? (
                        selectedFile.size / (1024 * 1024) <= transfer ? (
                            <button
                                className={`${styles.button} ${styles.primaryButton}`}
                                onClick={handleSubmit}
                                disabled={!selectedFile || !selectedVoice || isProcessing || disabledAfterCancel}
                            >
                                {isProcessing ? 'Processing...' : disabledAfterCancel ? 'Please wait...' : 'Upload and Generate'}
                            </button>
                        ) : (
                            <Link
                                to="/pricing"
                                className={`${styles.button} ${styles.primaryButton} ${styles.insufficientTransfer}`}
                            >
                                INSUFFICIENT TRANSFER ({(selectedFile.size / (1024 * 1024)).toFixed(2)}MB needed)
                            </Link>
                        )
                    ) : (
                        <button
                            className={`${styles.button} ${styles.primaryButton}`}
                            disabled={true}
                        >
                            Select a file to continue
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
