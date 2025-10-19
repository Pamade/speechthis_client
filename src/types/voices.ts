export interface GoogleVoice {
    language: string;
    language_code: string;
    gender: string;
    name: string;
    originalLanguageCode?: string; // For backend compatibility
    originalGender?: string; // Original gender value for backend compatibility
    friendlyName?: string; // Human-readable voice name like "Alex", "Maya"
}