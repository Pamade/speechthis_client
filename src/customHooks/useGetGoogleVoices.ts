import { useEffect, useState } from "react"
import { instanceNoAuth } from "../utils/axiosInstance"
import type { GoogleVoice } from "../types/voices"

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

// Best quality voices to filter to
const PREMIUM_VOICES = [
    'en-AU-Neural2-A', 'en-AU-Neural2-B', 'en-AU-Neural2-C', 'en-AU-Neural2-D',
    'en-CA-Neural2-A', 'en-CA-Neural2-B', 'en-CA-Neural2-C', 'en-CA-Neural2-D',
    'en-GB-Neural2-A', 'en-GB-Neural2-B', 'en-GB-Neural2-C', 'en-GB-Neural2-D', 'en-GB-Neural2-F',
    'en-US-Neural2-A', 'en-US-Neural2-C', 'en-US-Neural2-D', 'en-US-Neural2-E', 'en-US-Neural2-F', 'en-US-Neural2-G', 'en-US-Neural2-H', 'en-US-Neural2-I', 'en-US-Neural2-J',
    'en-US-Studio-M', 'en-US-Studio-O',
    'es-ES-Neural2-A', 'es-ES-Neural2-B', 'es-ES-Neural2-C', 'es-ES-Neural2-D', 'es-ES-Neural2-E', 'es-ES-Neural2-F',
    'es-US-Neural2-A', 'es-US-Neural2-B', 'es-US-Neural2-C',
    'fr-CA-Neural2-A', 'fr-CA-Neural2-B', 'fr-CA-Neural2-C', 'fr-CA-Neural2-D',
    'fr-FR-Neural2-A', 'fr-FR-Neural2-B', 'fr-FR-Neural2-C', 'fr-FR-Neural2-D', 'fr-FR-Neural2-E',
    'de-DE-Neural2-A', 'de-DE-Neural2-B', 'de-DE-Neural2-C', 'de-DE-Neural2-D', 'de-DE-Neural2-F',
    'it-IT-Neural2-A', 'it-IT-Neural2-C',
    'pt-BR-Neural2-A', 'pt-BR-Neural2-B', 'pt-BR-Neural2-C',
    'ja-JP-Neural2-B', 'ja-JP-Neural2-C', 'ja-JP-Neural2-D',
    'ko-KR-Neural2-A', 'ko-KR-Neural2-B', 'ko-KR-Neural2-C'
];

// Transform gender names
const transformGender = (gender: string): string => {
    return gender.toLowerCase() === 'male' ? 'Male' :
        gender.toLowerCase() === 'female' ? 'Female' : gender;
};

// Transform language codes to human-readable names
const transformLanguage = (languageCode: string): string => {
    return LANGUAGE_MAP[languageCode] || languageCode;
};

// Extract friendly voice name from technical voice name
const getFriendlyVoiceName = (voiceName: string): string => {
    // Common patterns in Google voice names:
    // en-US-Wavenet-A, en-US-Neural2-C, en-US-Standard-B, etc.

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

        // Handle special named voices (Chirp and others)
        'Umbriel': 'Umbriel', 'Oberon': 'Oberon', 'Titania': 'Titania',
        'Ariel': 'Ariel', 'Miranda': 'Miranda', 'Caliban': 'Caliban'
    };

    // Check if it's a letter-based voice name
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
};

export const useGetGoogleVoices = () => {
    const [voices, setVoices] = useState<GoogleVoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState<string>('');
    const [selectedGender, setSelectedGender] = useState<string>('');
    const [selectedVoice, setSelectedVoice] = useState<GoogleVoice | undefined>();

    const fetchVoices = async () => {
        try {
            const response = await instanceNoAuth.get('/google_voices/voices');
            console.log('Raw voices from backend:', response.data); // Debug log

            // Transform the data first
            const allVoices = response.data.map((voice: GoogleVoice) => ({
                ...voice,
                language: transformLanguage(voice.language_code),
                gender: transformGender(voice.gender),
                originalLanguageCode: voice.language_code, // Keep original for backend compatibility
                originalGender: voice.gender, // Keep original gender for backend compatibility
                friendlyName: getFriendlyVoiceName(voice.name) // Add friendly name for display
            }));

            console.log('Transformed voices:', allVoices); // Debug log

            // For now, let's not filter to premium voices to see all available voices
            // TODO: Re-enable premium filtering once we confirm voice names
            // const premiumVoices = allVoices.filter((voice: GoogleVoice) =>
            //     PREMIUM_VOICES.includes(voice.name)
            // );

            setVoices(allVoices); // Use all voices temporarily

            // Set default to US English
            const defaultVoice = allVoices.find((voice: GoogleVoice) =>
                voice.language.includes('English (US)') || voice.language.includes('English')
            );

            if (defaultVoice) {
                setSelectedLanguage(defaultVoice.language);
                setSelectedGender(defaultVoice.gender);
                !selectedVoice && handleVoiceSelect(defaultVoice);
            } else if (allVoices.length > 0) {
                // Fallback to first available voice
                setSelectedLanguage(allVoices[0].language);
                setSelectedGender(allVoices[0].gender);
                !selectedVoice && handleVoiceSelect(allVoices[0]);
            }
        } catch (err) {
            setError('Failed to load Google voices');
            console.error('Error fetching voices:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVoices();
    }, []);

    const filteredVoices = voices.filter(voice => {
        const matchesLanguage = !selectedLanguage || voice.language === selectedLanguage;
        const matchesGender = !selectedGender || voice.gender === selectedGender;
        return matchesLanguage && matchesGender;
    });

    const availableGenders = [...new Set(
        voices
            .filter(voice => !selectedLanguage || voice.language === selectedLanguage)
            .map(voice => voice.gender)
    )].sort();

    const availableLanguages = [...new Set(
        voices
            .filter(voice => !selectedGender || voice.gender === selectedGender)
            .map(voice => voice.language)
    )].sort();

    const handleVoiceSelect = (voice: GoogleVoice | null) => {
        setSelectedVoice(voice || undefined);
    };

    return {
        voices,
        loading,
        error,
        languages: availableLanguages,
        genders: availableGenders,
        filteredVoices,
        selectedLanguage,
        setSelectedLanguage,
        selectedGender,
        setSelectedGender,
        selectedVoice,
        handleVoiceSelect,
        fetchVoices
    };
}