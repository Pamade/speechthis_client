import { useState } from 'react';
import { instance, instanceNoAuth } from '../utils/axiosInstance';
import type { GoogleVoice } from '../types/voices';

interface UsePlaySampleReturn {
    isSamplePlaying: boolean;
    isPreparing: boolean;
    handleSampleButtonClick: (text: string, voice: GoogleVoice) => Promise<void>;
    stopSamplePlayback: () => void;
}

export const usePlaySample = (): UsePlaySampleReturn => {
    const [isSamplePlaying, setIsSamplePlaying] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
    const [sampleAudio, setSampleAudio] = useState<HTMLAudioElement | null>(null);

    const stopSamplePlayback = () => {
        if (sampleAudio) {
            sampleAudio.pause();
            sampleAudio.currentTime = 0;
            setIsSamplePlaying(false);
            setSampleAudio(null);
        }
    };

    const handleSampleButtonClick = async (text: string, voice: GoogleVoice) => {
        if (isSamplePlaying) {
            stopSamplePlayback();
            return;
        }

        if (!voice || !text) return;

        try {
            if (sampleAudio) {
                sampleAudio.pause();
                sampleAudio.currentTime = 0;
            }

            setIsPreparing(true);

            const response = await instanceNoAuth.post('/tts/synthesize-chunk', {
                text: text.slice(0, 500),
                chunkIndex: 0,
                languageCode: voice.language_code,
                voiceName: voice.name
            }, {
                responseType: 'arraybuffer'
            });

            const audioBlob = new Blob([response.data], { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onended = () => {
                setIsSamplePlaying(false);
                URL.revokeObjectURL(audioUrl);
                setSampleAudio(null);
            };

            setSampleAudio(audio);
            await audio.play();
            setIsSamplePlaying(true);
        } catch (err) {
            console.error('Error playing sample:', err);
            setIsSamplePlaying(false);
            setSampleAudio(null);
        } finally {
            setIsPreparing(false);
        }
    };

    return {
        isSamplePlaying,
        isPreparing,
        handleSampleButtonClick,
        stopSamplePlayback
    };
};
