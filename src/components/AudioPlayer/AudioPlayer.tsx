import type { FormEvent } from 'react';
import { useState } from 'react';
import { instanceNoAuth } from '../../utils/axiosInstance';
import styles from './AudioPlayer.module.scss';

interface AudioPlayerProps {
  text: string;
}

function downloadMP3FromBlob(audioBlob: Blob) {
  const url = URL.createObjectURL(audioBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tts-audio.mp3';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AudioPlayer = ({ text }: AudioPlayerProps) => {
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLButtonElement>) => {
    e.preventDefault();

    try {
      const response = await instanceNoAuth.post('/tts/synthesize', { text }, { responseType: 'arraybuffer' });
      const blob = new Blob([response.data], { type: 'audio/mp3' });
      setAudioBlob(blob);

      const audioUrl = URL.createObjectURL(blob);
      setAudioUrl(audioUrl);

      downloadMP3FromBlob(blob);
    } catch (error) {
      console.error('Error fetching audio:', error);
    }
  };

  const submitFile = async () => {
    if (!audioBlob) {
      alert('No audio to upload!');
      return;
    }

    const file = new File([audioBlob], 'audio.mp3', { type: 'audio/mp3' });
    const formData = new FormData();
    formData.append('file', file);

    const api_key_test = "eyJhbGciOiJIUzI1NiJ9.eyJhdXRob3JpdGllcyI6WyJST0xFX1VTRVIiXSwic3ViIjoiaW5zdTNuMjMzMjQyMjMzM3MxMzIzMWUzMjEzNDVAZ21haWwuY29tIiwiaWF0IjoxNzQ4MDA2NDA3LCJleHAiOjE4MzQ0MDY0MDd9.4Wmm0CnHSF1xj4Xvu6turaC7kZwIhtaZ10KujF9eGhE"

    try {
      await instanceNoAuth.post('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${api_key_test}`
        },
      });

      alert('File uploaded successfully!');
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload file.');
    }
  };

  return (
    <div className={styles.container}>
      <button 
        onClick={handleSubmit} 
        type='submit'
        className={styles.generateButton}
      >
        Generate MP3
      </button>
      {audioUrl && (
        <div className={styles.audioContainer}>
          <audio 
            src={audioUrl} 
            controls 
            className={styles.audioPlayer}
          />
          <button 
            onClick={submitFile}
            className={styles.uploadButton}
          >
            Upload MP3
          </button>
        </div>
      )}
    </div>
  );
};

export default AudioPlayer; 