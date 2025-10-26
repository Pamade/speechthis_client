import { useState, useRef, useCallback, useEffect } from 'react';
import { instance, instanceNoAuth } from '../utils/axiosInstance';
type SpeechSDKType = typeof import('microsoft-cognitiveservices-speech-sdk');

export interface WordBoundary {
  word: string;
  offset: number;
  duration: number;
  textOffset: number;
  length: number;
  absoluteTextPosition: number;
}

export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  isSynthesizing: boolean; // Add this
  currentWord: string;
  currentTextPosition: number;
  chunksReady: number;
  isSeeking: boolean;
  // Max absolute text offset (in normalized text space) that is synthesized and ready
  // We use this to gate UI highlighting after a seek until the target chunk is synthesized
  readyTextMaxOffset: number;
  rate: number;
  playbackSessionId: number; // Add this
}

interface UseAzureTTSOptions {
  voice?: string;
  rate?: number;
  sampleMode?: boolean; // When true, uses server-side synthesis via public endpoint
  onWordBoundary?: (boundary: WordBoundary) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface TextChunk {
  text: string;
  startPosition: number;
  endPosition: number;
  index: number;
}

interface ChunkBuffer {
  audioBuffer: AudioBuffer;
  wordBoundaries: WordBoundary[];
  duration: number;
}

export const useAzureTTS = (options: UseAzureTTSOptions = {}) => {
  // 1. Basic state
  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    isSynthesizing: false,
    currentWord: '',
    currentTextPosition: 0,
    chunksReady: 0,
    isSeeking: false,
    readyTextMaxOffset: 0,
    rate: options.rate || 1.0,
    playbackSessionId: 0,
  });

  // 2. Azure credentials
  const azureTokenRef = useRef<string | null>(null);
  const azureRegionRef = useRef<string>('westeurope');

  // 3. Core refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);


  // Fixed timing refs
  const chunkStartTimeRef = useRef<number>(0); // When current chunk started playing
  const synthesizerRef = useRef<any | null>(null);
  const pausedChunkIndexRef = useRef<number>(0);
  const pausedTimeInChunkRef = useRef<number>(0);
  const currentChunkStartOffsetRef = useRef<number>(0); // offset used when starting current chunk

  // Keep options fresh using a ref to avoid stale closures in callbacks
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
    // Sync voice override with options to ensure latest voice is used
    voiceOverrideRef.current = options.voice || null;
  }, [options]);

  // 4. Chunked synthesis refs
  const speechSDKRef = useRef<SpeechSDKType | null>(null);

  const getSpeechSDK = useCallback(async (): Promise<SpeechSDKType> => {
    if (!speechSDKRef.current) {
      console.log('📦 Loading Speech SDK...');
      speechSDKRef.current = await import('microsoft-cognitiveservices-speech-sdk');
      console.log('✅ Speech SDK loaded');
    }
    return speechSDKRef.current;
  }, []);

  const textRef = useRef<string>('');
  const chunksRef = useRef<TextChunk[]>([]);
  const chunkBuffersRef = useRef<Map<number, ChunkBuffer>>(new Map());
  const currentChunkIndexRef = useRef<number>(0);
  const synthesisQueueRef = useRef<number[]>([]);
  const isSynthesizingRef = useRef<boolean>(false);
  const currentWordBoundariesRef = useRef<WordBoundary[]>([]);
  const wordBoundaryTimerRef = useRef<number | null>(null);

  // Add ref to track if we're seeking
  const isSeekingRef = useRef<boolean>(false);

  // Voice override ref to avoid React render timing issues
  const voiceOverrideRef = useRef<string | null>(null);

  // Add a ref to store the last known absolute text position
  const lastAbsoluteTextPositionRef = useRef<number | null>(null);

  // Add a playback session ID to prevent race conditions with onended
  const playbackSessionIdRef = useRef<number>(0);

  // Constants
  const WORDS_PER_CHUNK = 50;
  const BUFFER_SIZE = 3; // Keep 3 chunks buffered

  // Step 1: Token fetching (use public endpoint in sample mode)
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const endpoint = options.sampleMode ? '/public/sample/get-token' : '/azure-tts/get-token';
        const axiosInstance = options.sampleMode ? instanceNoAuth : instance;

        console.log(`🔑 Fetching Azure token from ${endpoint}...`);
        const response = await axiosInstance.post(endpoint);

        if (response.data?.token) {
          azureTokenRef.current = response.data.token;
          azureRegionRef.current = response.data.region || 'westeurope';
          console.log('✅ Azure token fetched successfully');

          // Preload SDK after token is ready
          getSpeechSDK();
        }
      } catch (error) {
        console.error('❌ Failed to fetch Azure token:', error);
        options.onError?.('Failed to fetch authentication token');
      }
    };

    fetchToken();
  }, [options.sampleMode, getSpeechSDK]);

  // No duration estimation logic

  const createTextChunks = useCallback((text: string): TextChunk[] => {
    // The incoming text is assumed to be ALREADY NORMALIZED by the caller (e.g., PdfViewer).
    // We will chunk it directly.
    const normalized = text;
    const chunks: TextChunk[] = [];

    // Chunk DIRECTLY on the normalized text by word count to keep durations stable.
    // We'll cut at spaces so each chunk boundary aligns with word boundaries.
    let start = 0;
    let cur = 0;
    let wordsInChunk = 0;
    const len = normalized.length;

    // Helper to push a chunk [start, end)
    const pushChunk = (end: number) => {
      if (end <= start) return;
      const idx = chunks.length;
      chunks.push({
        text: normalized.slice(start, end), // USE normalized substring for synthesis and offsets
        startPosition: start,
        endPosition: end,
        index: idx
      });
      start = end; // next chunk starts where this ended (contiguous, half-open)
      wordsInChunk = 0;
    };

    while (cur < len) {
      // Find next space (word boundary). If none, we're at the last word.
      const nextSpace = normalized.indexOf(' ', cur);
      wordsInChunk++;
      if (nextSpace === -1) {
        // last word to end
        pushChunk(len);
        break;
      }
      cur = nextSpace + 1; // move past the space; word completed
      if (wordsInChunk >= WORDS_PER_CHUNK) {
        pushChunk(cur); // cut after the space (keeps spaces inside chunk)
      }
    }

    // Safety: if no chunks due to empty text, return empty array
    if (chunks.length === 0 && len > 0) {
      // fallback to single chunk
      chunks.push({ text: normalized, startPosition: 0, endPosition: len, index: 0 });
    }

    // Debug: verify contiguity
    if (chunks.length > 0) {
      for (let i = 1; i < chunks.length; i++) {
        if (chunks[i].startPosition !== chunks[i - 1].endPosition) {
          console.warn(`⚠️ Non-contiguous chunks at ${i - 1} -> ${i}: ` +
            `${chunks[i - 1].endPosition} vs ${chunks[i].startPosition}`);
        }
      }
      const first = chunks[0];
      const last = chunks[chunks.length - 1];
      console.log(`🧩 Normalized chunking created ${chunks.length} chunks. Range 0-${len}. First: ${first.startPosition}-${first.endPosition}, Last: ${last.startPosition}-${last.endPosition}`);
    }

    return chunks;
  }, []);

  const startProgressTimer = useCallback((startFromChunkTime = 0) => {
    // Clear any existing timer
    if (wordBoundaryTimerRef.current) {
      clearInterval(wordBoundaryTimerRef.current);
    }

    // Store the starting offset for this chunk when timer starts
    const chunkStartOffset = startFromChunkTime;

    // Only track word boundaries for highlighting; no time/progress estimation
    wordBoundaryTimerRef.current = window.setInterval(() => {
      if (!audioContextRef.current || !sourceNodeRef.current || isSeekingRef.current) return;

      const chunkIndex = currentChunkIndexRef.current;
      const chunkBuffer = chunkBuffersRef.current.get(chunkIndex);

      if (!chunkBuffer || !chunkBuffer.wordBoundaries) return;

      const chunkElapsedSinceStart = audioContextRef.current.currentTime - chunkStartTimeRef.current;
      const chunkElapsedTime = chunkStartOffset + chunkElapsedSinceStart;
      // Find current word based on elapsed time in chunk
      const currentWordBoundary = chunkBuffer.wordBoundaries.find((boundary, index) => {
        const nextBoundary = chunkBuffer.wordBoundaries[index + 1];
        return chunkElapsedTime >= boundary.offset &&
          (!nextBoundary || chunkElapsedTime < nextBoundary.offset);
      });

      if (currentWordBoundary) {
        setState(prev => ({
          ...prev,
          currentWord: currentWordBoundary.word,
          currentTextPosition: currentWordBoundary.absoluteTextPosition
        }));
      }
    }, 50);
  }, []);

  const queueChunksForSynthesis = useCallback((startIndex: number, count: number) => {
    const endIndex = Math.min(startIndex + count, chunksRef.current.length);

    for (let i = startIndex; i < endIndex; i++) {
      if (!chunkBuffersRef.current.has(i) && !synthesisQueueRef.current.includes(i)) {
        synthesisQueueRef.current.push(i);
      }
    }

    // Start synthesis if not already running
    if (!isSynthesizingRef.current) {
      processSynthesisQueue();
    }
  }, []);
  // Step 2: Text chunking utility
  const synthesizeText = useCallback(async (text: string, preservePosition = false, voiceOverride?: string): Promise<number> => {
    console.log('🎬 Starting chunked synthesis for text:', text.substring(0, 100) + '...');

    // Invalidate previous playback sessions and clear any pending synthesis requests
    playbackSessionIdRef.current++;
    synthesisQueueRef.current = [];
    isSynthesizingRef.current = false; // Force stop any ongoing synthesis loop

    // Set voice override immediately to avoid render timing issues
    if (voiceOverride) {
      voiceOverrideRef.current = voiceOverride;
      console.log('🎙️ Voice override set to:', voiceOverride);
    }

    // Wait for Azure token to be available (both modes now use client-side synthesis)
    if (!azureTokenRef.current) {
      console.log('⏳ Waiting for Azure token...');
      setState(prev => ({ ...prev, isLoading: true }));

      // Wait up to 10 seconds for token
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds

      while (!azureTokenRef.current && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!azureTokenRef.current) {
        setState(prev => ({ ...prev, isLoading: false }));
        throw new Error('Azure token not available after timeout');
      }

      console.log('✅ Azure token is now available');
    }

    setState(prev => ({ ...prev, isLoading: true, readyTextMaxOffset: 0 }));

    try {
      // Store text and create chunks
      textRef.current = text;
      chunksRef.current = createTextChunks(text);
      chunkBuffersRef.current.clear();

      // Only reset position if not preserving it
      if (!preservePosition) {
        currentChunkIndexRef.current = 0;
      }
      // Reset any timing baselines used only for highlighting

      // Reset readiness
      setState(prev => ({ ...prev, readyTextMaxOffset: 0 }));

      console.log(`📝 Created ${chunksRef.current.length} chunks`);
      // Debug: Log first few chunks
      chunksRef.current.slice(0, 3).forEach((chunk, index) => {
        console.log(`Chunk ${index}:`, chunk.text.substring(0, 50) + '...');
      });

      // Validate chunks were created
      if (chunksRef.current.length === 0) {
        throw new Error('No chunks created from text');
      }

      // Initialize audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Decide which chunk to wait for: current one if preserving position, else 0
      const requiredIndex = preservePosition ? currentChunkIndexRef.current : 0;

      // Queue chunks for synthesis prioritizing requiredIndex
      queueChunksForSynthesis(requiredIndex, BUFFER_SIZE);
      if (requiredIndex !== 0) {
        // Also queue start to keep early navigation responsive
        queueChunksForSynthesis(0, BUFFER_SIZE);
      }

      // Wait for the required chunk to be ready
      let attempts = 0;
      const maxAttempts = 200; // 20 seconds timeout (increased for synthesis)

      while (!chunkBuffersRef.current.has(requiredIndex) && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!chunkBuffersRef.current.has(requiredIndex)) {
        throw new Error('Timeout waiting for first required chunk to synthesize');
      }

      const firstChunk = chunkBuffersRef.current.get(requiredIndex)!;

      setState(prev => ({
        ...prev,
        isLoading: false,
        isSynthesizing: false  // Stop showing loading on button when first chunk is ready
      }));

      console.log('✅ First chunk ready, duration:', firstChunk.duration);
      return firstChunk.duration;

    } catch (error) {
      console.error('❌ Chunked synthesis error:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      options.onError?.(`Synthesis failed: ${error}`);
      throw error;
    }
  }, [createTextChunks, queueChunksForSynthesis, options]);

  const playCurrentChunk = useCallback(async (offsetInChunk = 0) => {
    const chunkIndex = currentChunkIndexRef.current;

    // Wait for the chunk to be ready if it's not already buffered
    if (!chunkBuffersRef.current.has(chunkIndex)) {
      console.log(`⏳ Chunk ${chunkIndex} not ready, waiting...`);
      // Queue it for synthesis if it's not already in the queue
      if (!synthesisQueueRef.current.includes(chunkIndex)) {
        queueChunksForSynthesis(chunkIndex, 1);
      }

      let attempts = 0;
      const maxAttempts = 100; // Wait up to 10 seconds
      while (!chunkBuffersRef.current.has(chunkIndex) && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!chunkBuffersRef.current.has(chunkIndex)) {
        console.error(`❌ Failed to load chunk ${chunkIndex} after timeout.`);
        options.onError?.(`Playback failed: Could not load audio for chunk ${chunkIndex}.`);
        setState(prev => ({ ...prev, isPlaying: false, isPaused: false }));
        return;
      }
      console.log(`✅ Chunk ${chunkIndex} is now ready.`);
    }

    const chunkBuffer = chunkBuffersRef.current.get(chunkIndex);

    if (!chunkBuffer || !audioContextRef.current) {
      console.error(`❌ No chunk buffer available for index: ${chunkIndex}. Available chunks: ${Array.from(chunkBuffersRef.current.keys())}`);
      return;
    }
    currentWordBoundariesRef.current = chunkBuffer.wordBoundaries || [];


    console.log(`▶️ Playing chunk ${chunkIndex} from offset ${offsetInChunk.toFixed(2)}s (currentChunkIndexRef: ${currentChunkIndexRef.current})`);

    // Stop existing source node
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      sourceNodeRef.current = null;
    }

    // Create new source node
    const sourceNode = audioContextRef.current.createBufferSource();
    sourceNode.buffer = chunkBuffer.audioBuffer;
    sourceNode.connect(audioContextRef.current.destination);
    sourceNodeRef.current = sourceNode;

    // Set chunk start time for timing calculations
    chunkStartTimeRef.current = audioContextRef.current.currentTime;
    currentChunkStartOffsetRef.current = offsetInChunk;

    // Update UI
    setState(prev => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
      isLoading: false, // Turn off loading when playback starts
    }));

    // Start progress timer from offset
    startProgressTimer(offsetInChunk);

    // Handle chunk end
    sourceNode.onended = async () => {
      // Capture session ID at the time of creation
      const sessionId = playbackSessionIdRef.current;

      if (isSeekingRef.current) {
        console.log('Skipping onended for chunk', chunkIndex, 'due to active seek');
        return;
      }

      // Check if this onended event is from the current playback session
      if (sessionId !== playbackSessionIdRef.current) {
        console.log(`Skipping stale onended event for chunk ${chunkIndex} (session ${sessionId} vs current ${playbackSessionIdRef.current})`);
        return;
      }

      console.log(`🏁 Chunk ${chunkIndex} completed`);

      // Move to next chunk
      if (currentChunkIndexRef.current < chunksRef.current.length - 1) {
        currentChunkIndexRef.current++;
        console.log(`➡️ Advancing to chunk ${currentChunkIndexRef.current}`);
        playCurrentChunk(0);

        // Proactively buffer next chunks
        queueChunksForSynthesis(currentChunkIndexRef.current + 1, BUFFER_SIZE);
      } else {
        console.log('✅ All chunks played');
        setState(prev => ({
          ...prev,
          isPlaying: false,
          isPaused: false,
          currentWord: '',
        }));
        optionsRef.current.onComplete?.();
      }
    };

    // Start playback from offset
    const maxOffset = Math.min(offsetInChunk, chunkBuffer.audioBuffer.duration - 0.1);
    const duration = chunkBuffer.audioBuffer.duration - maxOffset;

    if (duration > 0.1) {
      sourceNode.start(0, maxOffset, duration);
    } else {
      // Offset is near end, move to next chunk
      console.log(`🎯 Offset ${offsetInChunk}s is near end of chunk (${chunkBuffer.audioBuffer.duration}s), moving to next`);
      currentChunkIndexRef.current++;
      if (currentChunkIndexRef.current < chunksRef.current.length) {
        queueChunksForSynthesis(currentChunkIndexRef.current, BUFFER_SIZE);
        setTimeout(() => playCurrentChunk(0), 50);
      } else {
        setState(prev => ({
          ...prev,
          isPlaying: false,
          isPaused: false
        }));
        options.onComplete?.();
      }
    }
  }, [queueChunksForSynthesis, startProgressTimer, options]);

  const play = useCallback(async () => {
    console.log('▶️ Play called');
    playbackSessionIdRef.current++; // New session

    // Check if we have text chunks available
    if (chunksRef.current.length === 0) {
      throw new Error('No text chunks available. Please synthesize text first.');
    }

    // Ensure we start from the beginning
    currentChunkIndexRef.current = 0;

    // Wait for chunk 0 to be ready with current voice (preserves buffering logic)
    if (!chunkBuffersRef.current.has(0)) {
      console.log('⏳ Waiting for chunk 0 to be synthesized with current voice...');

      // Queue chunk 0 for synthesis if not already queued (uses existing buffering)
      if (!synthesisQueueRef.current.includes(0)) {
        queueChunksForSynthesis(0, BUFFER_SIZE);
      }

      // Wait for chunk 0 to be ready (but keep the good buffering logic)
      let attempts = 0;
      const maxAttempts = 200; // 20 seconds max
      while (!chunkBuffersRef.current.has(0) && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!chunkBuffersRef.current.has(0)) {
        throw new Error('Timeout waiting for audio synthesis to complete');
      }
    }

    try {
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      setState(prev => ({ ...prev, isPlaying: true, isPaused: false, playbackSessionId: playbackSessionIdRef.current }));

      await playCurrentChunk(0);

    } catch (error) {
      console.error('❌ Play error:', error);
      setState(prev => ({ ...prev, isPlaying: false, isPaused: false }));
      throw error;
    }
  }, [queueChunksForSynthesis]);

  const pause = useCallback(() => {
    if (!state.isPlaying) {
      console.log('❌ Cannot pause - not currently playing');
      return;
    }

    console.log('⏸️ Pausing chunked playback');

    try {
      // Calculate how much time has elapsed in the current chunk directly from audio clock
      const timeInCurrentChunk = audioContextRef.current
        ? Math.max(0, currentChunkStartOffsetRef.current + (audioContextRef.current.currentTime - chunkStartTimeRef.current))
        : 0;

      // Store the exact position within the current chunk
      const pausedChunkIndex = currentChunkIndexRef.current;
      const pausedTimeInChunk = Math.max(0, timeInCurrentChunk);

      // Store these for resume
      pausedChunkIndexRef.current = pausedChunkIndex;
      pausedTimeInChunkRef.current = pausedTimeInChunk;
      // Also store the absolute text position for more accurate cross-voice resume
      lastAbsoluteTextPositionRef.current = state.currentTextPosition;

      if (audioContextRef.current?.state === "running") {
        audioContextRef.current.suspend();
      }

      // No progress timer to clear
      if (wordBoundaryTimerRef.current) {
        clearInterval(wordBoundaryTimerRef.current);
        wordBoundaryTimerRef.current = null;
      }


      setState(prev => ({
        ...prev,
        isPlaying: false,
        isPaused: true,
      }));

      console.log(`✅ Paused at chunk ${pausedChunkIndex}, time in chunk: ${pausedTimeInChunk.toFixed(2)}s`);
    } catch (error) {
      console.error("❌ Pause error:", error);
    }
  }, [state.isPlaying]);

  const resume = useCallback(async () => {
    if (!state.isPaused) {
      console.log("❌ Cannot resume - not paused");
      return;
    }

    try {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

      // Resume from exactly where we paused
      currentChunkIndexRef.current = pausedChunkIndexRef.current;
      const timeInChunk = pausedTimeInChunkRef.current;

      setState(prev => ({
        ...prev,
        isPlaying: true,
        isPaused: false,
      }));

      console.log(`✅ Resuming chunk ${currentChunkIndexRef.current} at ${timeInChunk.toFixed(2)}s`);

      await playCurrentChunk(timeInChunk);

    } catch (error) {
      console.error("❌ Resume error:", error);
    }
  }, [state.isPaused, playCurrentChunk]);

  const resumeFromPosition = useCallback(async (chunkIndex: number, timeInChunk: number) => {
    console.log(`📍 Resuming from chunk ${chunkIndex} at ${timeInChunk.toFixed(2)}s`);

    // If we have a more accurate text offset, prefer that.
    if (lastAbsoluteTextPositionRef.current !== null && lastAbsoluteTextPositionRef.current > 0) {
      console.log(`🎯 Found absolute text position ${lastAbsoluteTextPositionRef.current}, using seekToTextOffset for accuracy.`);
      await seekToTextOffset(lastAbsoluteTextPositionRef.current);
      lastAbsoluteTextPositionRef.current = null; // Consume it
      return;
    }

    try {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

      // Set the position
      currentChunkIndexRef.current = chunkIndex;
      pausedChunkIndexRef.current = chunkIndex;
      pausedTimeInChunkRef.current = timeInChunk;

      // Wait for the target chunk to be ready
      if (!chunkBuffersRef.current.has(chunkIndex)) {
        console.log(`⏳ Waiting for chunk ${chunkIndex} to be synthesized...`);

        if (!synthesisQueueRef.current.includes(chunkIndex)) {
          queueChunksForSynthesis(chunkIndex, BUFFER_SIZE);
        }

        let attempts = 0;
        const maxAttempts = 200;
        while (!chunkBuffersRef.current.has(chunkIndex) && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (!chunkBuffersRef.current.has(chunkIndex)) {
          throw new Error(`Timeout waiting for chunk ${chunkIndex} to be synthesized`);
        }
      }

      setState(prev => ({
        ...prev,
        isPlaying: true,
        isPaused: false,
      }));

      await playCurrentChunk(timeInChunk);

    } catch (error) {
      console.error("❌ Resume from position error:", error);
      setState(prev => ({ ...prev, isPlaying: false, isPaused: false }));
      throw error;
    }
  }, [playCurrentChunk, queueChunksForSynthesis]);

  const stop = useCallback(() => {
    if (!state.isPlaying && !state.isPaused) {
      console.log('❌ Cannot stop - not currently playing or paused');
      return;
    }

    console.log('🛑 Stopping chunked playback');

    try {
      // Invalidate future onended events from the current source
      playbackSessionIdRef.current++;

      // Guard onended handler during an intentional stop to avoid auto-advance
      isSeekingRef.current = true;

      // Calculate and save current position (same logic as pause)
      const timeInCurrentChunk = audioContextRef.current
        ? Math.max(0, currentChunkStartOffsetRef.current + (audioContextRef.current.currentTime - chunkStartTimeRef.current))
        : 0;

      const pausedChunkIndex = currentChunkIndexRef.current;
      const pausedTimeInChunk = Math.max(0, timeInCurrentChunk);

      // Store these for later use
      pausedChunkIndexRef.current = pausedChunkIndex;
      pausedTimeInChunkRef.current = pausedTimeInChunk;
      // Also store the absolute text position for more accurate cross-voice resume
      lastAbsoluteTextPositionRef.current = state.currentTextPosition;

      // Stop current source (safely detach onended to avoid cascading)
      if (sourceNodeRef.current) {
        try { (sourceNodeRef.current as any).onended = null; } catch { }
        try { sourceNodeRef.current.stop(); } catch { }
        try { sourceNodeRef.current.disconnect(); } catch { }
        sourceNodeRef.current = null;
      }

      // Suspend audio context quickly to kill any lingering tail
      try { if (audioContextRef.current?.state === 'running') { void audioContextRef.current.suspend(); } } catch { }

      // Clear progress timer
      // No progress timer to clear
      if (wordBoundaryTimerRef.current) {
        clearInterval(wordBoundaryTimerRef.current);
        wordBoundaryTimerRef.current = null;
      }
      // Update state - set to paused so it can be resumed
      setState(prev => ({
        ...prev,
        isPlaying: false,
        isPaused: true,
        currentWord: ''
      }));

      console.log(`✅ Stopped at chunk ${pausedChunkIndex}, time in chunk: ${pausedTimeInChunk.toFixed(2)}s`);

      // Clear guard after stopping (allow onended for normal playback later)
      isSeekingRef.current = false;

    } catch (error) {
      console.error('❌ Stop error:', error);
    }
  }, [state.isPlaying, state.isPaused]);

  const getCurrentPosition = useCallback(() => {
    if (state.isPaused) {
      // Return the stored paused position
      return {
        chunkIndex: pausedChunkIndexRef.current,
        timeInChunk: pausedTimeInChunkRef.current
      };
    } else if (state.isPlaying) {
      // Calculate current position from audio clock
      const timeInCurrentChunk = audioContextRef.current
        ? Math.max(0, currentChunkStartOffsetRef.current + (audioContextRef.current.currentTime - chunkStartTimeRef.current))
        : 0;

      return {
        chunkIndex: currentChunkIndexRef.current,
        timeInChunk: timeInCurrentChunk,
        absoluteTextPosition: state.currentTextPosition,
      };
    } else {
      // Not playing or paused, return start position
      return {
        chunkIndex: 0,
        timeInChunk: 0,
        absoluteTextPosition: 0,
      };
    }
  }, [state.isPlaying, state.isPaused, state.currentTextPosition]);

  const reset = useCallback(() => {
    console.log('⏮️ Resetting chunked playback to beginning');
    playbackSessionIdRef.current++; // Invalidate any lingering sessions

    try {
      // Stop current playback
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }

      // Clear progress timer
      // No progress timer to clear

      // Reset positions
      currentChunkIndexRef.current = 0;
      chunkStartTimeRef.current = 0;

      // Update state
      setState(prev => ({
        ...prev,
        isPlaying: false,
        isPaused: false,
        currentWord: '',
        currentTextPosition: 0,
        readyTextMaxOffset: 0
      }));

      console.log('✅ Reset to beginning');

    } catch (error) {
      console.error('❌ Reset error:', error);
    }
  }, []);

  const processSynthesisQueue = useCallback(async () => {
    if (isSynthesizingRef.current || synthesisQueueRef.current.length === 0) {
      return;
    }

    isSynthesizingRef.current = true;
    setState(prev => ({ ...prev, isSynthesizing: true }));

    while (synthesisQueueRef.current.length > 0) {
      const chunkIndex = synthesisQueueRef.current.shift()!;

      if (!chunkBuffersRef.current.has(chunkIndex)) {
        try {
          // Always use client-side synthesis to get word boundaries for accurate highlighting
          await synthesizeChunk(chunkIndex);

        } catch (error) {
          console.error(`❌ Failed to synthesize chunk ${chunkIndex}:`, error);
        }
      }
    }

    isSynthesizingRef.current = false;
    setState(prev => ({ ...prev, isSynthesizing: false }));
  }, []); // synthesizeChunk is defined later but stable

  // Removed percentage-based seek; using text-offset and +/- seconds seeks only

  // No estimated duration tracking

  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up Azure TTS resources');

    // Stop current playback
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    // Clear timers
    // No progress timer

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Close synthesizer
    if (synthesizerRef.current) {
      synthesizerRef.current.close();
      synthesizerRef.current = null;
    }

    // Clear buffers
    chunkBuffersRef.current.clear();
    synthesisQueueRef.current = [];
    isSynthesizingRef.current = false;
    setState(prev => ({ ...prev, isSynthesizing: false }));
  }, []);
  // Add cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const synthesizeChunk = useCallback(async (chunkIndex: number): Promise<void> => {

    const chunk = chunksRef.current[chunkIndex];
    if (!chunk) {
      console.error(`❌ Chunk ${chunkIndex} not found. Available chunks: ${chunksRef.current.length}`);
      throw new Error(`Chunk ${chunkIndex} not found`);
    }

    if (!azureTokenRef.current) {
      const errorMsg = 'Synthesis failed: Azure token not available';
      console.error(`❌ ${errorMsg}`);
      optionsRef.current.onError?.(errorMsg);
      setState(prev => ({ ...prev, isLoading: false }));
      throw new Error(errorMsg);
    }

    if (!audioContextRef.current) {
      throw new Error('Audio context not available');
    }

    const SpeechSDK = await getSpeechSDK();


    // Create mapping from original text positions to normalized positions within this chunk
    const createNormalizedMapping = (originalText: string) => {
      const mapping: { [originalPos: number]: number } = {};
      let normalizedPos = 0;

      // Apply same normalization as in createTextChunks
      for (let i = 0; i <= originalText.length; i++) {
        mapping[i] = normalizedPos;

        if (i < originalText.length) {
          const char = originalText[i];

          // Handle character transformations that affect position
          if (char === "'" || char === "\u2019" || char === "\u2018" || char === "\u02BC" || char === "\uFF07") {
            // Apostrophes are removed, don't advance normalized position
            continue;
          } else if (char === "\u2026") {
            // Ellipsis becomes "..." (3 characters)
            normalizedPos += 3;
          } else if (char === "\u2013" || char === "\u2014") {
            // Dashes become "-" (1 character)
            normalizedPos += 1;
          } else if (/[\p{Z}\s\u200B-\u200D]/u.test(char)) {
            // All Unicode space characters become regular space
            // \p{Z} = all Unicode space separators, plus zero-width spaces
            normalizedPos += 1;
          } else {
            // Regular character, converted to lowercase
            normalizedPos += 1;
          }
        }
      }

      // Debug the mapping for chunks that might contain "Geographical"
      if (chunkIndex > 400 && originalText.toLowerCase().includes('geographical')) {
        console.log(`🗺️ Mapping debug for chunk ${chunkIndex} containing "geographical":`);
        console.log(`   - Original text length: ${originalText.length}`);
        console.log(`   - Normalized length: ${normalizedPos}`);

        // Find "geographical" in the text and show mapping around it
        const geoIndex = originalText.toLowerCase().indexOf('geographical');
        if (geoIndex >= 0) {
          console.log(`   - "Geographical" found at original position: ${geoIndex}`);
          console.log(`   - Maps to normalized position: ${mapping[geoIndex]}`);

          // Show some context around it
          for (let j = Math.max(0, geoIndex - 5); j < Math.min(originalText.length, geoIndex + 15); j++) {
            console.log(`     ${j}: "${originalText[j]}" -> ${mapping[j]}`);
          }
        }
      }

      return mapping;
    }; const normalizedMapping = createNormalizedMapping(chunk.text);

    return new Promise((resolve, reject) => {
      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
        azureTokenRef.current!,
        azureRegionRef.current
      );
      // const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(azureTokenRef.current!, azureRegionRef.current);
      // Use voice override if available, otherwise fall back to options
      const voiceToUse = voiceOverrideRef.current || optionsRef.current.voice || 'en-US-JennyNeural';
      speechConfig.speechSynthesisVoiceName = voiceToUse;
      console.log(`🎙️ Synthesizing chunk ${chunkIndex} with voice: ${voiceToUse}`);
      speechConfig.speechSynthesisOutputFormat = SpeechSDK.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;
      const pullStream = SpeechSDK.AudioOutputStream.createPullStream();
      const audioConfig = SpeechSDK.AudioConfig.fromStreamOutput(pullStream);
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);

      const wordBoundaries: WordBoundary[] = [];

      synthesizer.wordBoundary = (_sender, event) => {
        // Adjust text offset to account for SSML wrapper
        const adjustedTextOffset = Math.max(0, event.textOffset - ssmlTextOffset);

        // Map adjusted text offset to normalized offset within this chunk
        const normalizedOffset = normalizedMapping[adjustedTextOffset] || 0;

        const boundary: WordBoundary = {
          word: event.text,
          offset: event.audioOffset / 10000000, // Convert to seconds
          duration: event.duration / 10000000,
          textOffset: adjustedTextOffset, // Use adjusted offset
          length: event.wordLength,
          absoluteTextPosition: chunk.startPosition + normalizedOffset
        };

        // Enhanced debugging for position calculation
        if (chunkIndex > 400 || event.text.includes('.') || event.text.includes("'") || event.text.toLowerCase().includes('geographical')) {
          console.log(`🎯 Word boundary: "${event.text}" in chunk ${chunkIndex}`);
          console.log(`   - Chunk start position: ${chunk.startPosition}`);
          console.log(`   - Event text offset (raw): ${event.textOffset}`);
          console.log(`   - SSML-adjusted offset: ${adjustedTextOffset}`);
          console.log(`   - Mapped normalized offset: ${normalizedOffset}`);
          console.log(`   - Final absolute position: ${boundary.absoluteTextPosition}`);

          // Show a snippet of the original text around this position
          const contextStart = Math.max(0, adjustedTextOffset - 20);
          const contextEnd = Math.min(chunk.text.length, adjustedTextOffset + event.wordLength + 20);
          const context = chunk.text.substring(contextStart, contextEnd);
          const wordStart = event.textOffset - contextStart;
          const wordEnd = wordStart + event.wordLength;
          console.log(`   - Context: "${context}"`);
          console.log(`   - Word position in context: ${wordStart}-${wordEnd}`);
        }

        wordBoundaries.push(boundary);
      };

      // Use proper SSML with required voice tag and rate control
      const currentRate = optionsRef.current.rate || 1.0;

      // Create proper SSML with required voice tag
      const ssmlPrefix = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voiceToUse}"><prosody rate="${currentRate}">`;
      const ssmlSuffix = `</prosody></voice></speak>`;
      const escapedText = chunk.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ssml = ssmlPrefix + escapedText + ssmlSuffix;

      // Calculate the offset difference caused by SSML wrapper
      const ssmlTextOffset = ssmlPrefix.length;

      synthesizer.speakSsmlAsync(
        ssml,
        async (result) => {
          try {
            if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
              const audioData = result.audioData;
              const audioBuffer = await audioContextRef.current!.decodeAudioData(audioData.slice(0));

              const chunkBuffer: ChunkBuffer = {
                audioBuffer,
                wordBoundaries,
                duration: audioBuffer.duration
              };

              chunkBuffersRef.current.set(chunkIndex, chunkBuffer);
              setState(prev => ({
                ...prev,
                chunksReady: chunkBuffersRef.current.size,
                // When a chunk finishes, update readiness to at least this chunk's endPosition
                readyTextMaxOffset: Math.max(prev.readyTextMaxOffset || 0, chunk.endPosition)
              }));
              // No progressive calibration

              console.log(`✅ Chunk ${chunkIndex} synthesized, duration: ${audioBuffer.duration.toFixed(2)}s`);
              resolve();
            } else {
              reject(new Error(`Synthesis failed: ${result.errorDetails}`));
            }
          } catch (error) {
            console.error(`❌ Error processing chunk ${chunkIndex}:`, error);
            reject(error);
          } finally {
            synthesizer.close();
          }
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });
  }, [getSpeechSDK]);

  // Map absolute text offset to playback by using chunk boundaries
  const seekToTextOffset = useCallback(async (textOffset: number) => {
    1
    if (!audioContextRef.current) return;

    setState(prev => ({ ...prev, isSeeking: true }));
    isSeekingRef.current = true;

    // Identify target chunk by text range
    const chunks = chunksRef.current;
    if (!chunks || chunks.length === 0) {
      isSeekingRef.current = false;
      setState(prev => ({ ...prev, isSeeking: false }));
      return;
    }

    // First, find which chunk range we should be looking at
    let relevantChunks: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const distance = Math.min(
        Math.abs(textOffset - chunk.startPosition),
        Math.abs(textOffset - chunk.endPosition)
      );
      if (distance < 5000) { // Within 5000 characters
        relevantChunks.push(i);
      }
    }

    if (relevantChunks.length === 0) {
      // No chunks close, show chunks around the estimated area
      const estimatedChunk = Math.floor(chunks.length * textOffset / chunks[chunks.length - 1].endPosition);
      const searchStart = Math.max(0, estimatedChunk - 10);
      const searchEnd = Math.min(chunks.length, estimatedChunk + 10);
      relevantChunks = Array.from({ length: searchEnd - searchStart }, (_, i) => searchStart + i);
      console.log(`⚠️ No chunks within 5000 chars. Estimated chunk area: ${estimatedChunk}, showing range ${searchStart}-${searchEnd}`);
    }

    console.log(`📋 Checking ${relevantChunks.length} relevant chunks:`);
    for (const i of relevantChunks) {
      const chunk = chunks[i];
      const inRange = textOffset >= chunk.startPosition && textOffset < chunk.endPosition;
      const distance = Math.min(
        Math.abs(textOffset - chunk.startPosition),
        Math.abs(textOffset - chunk.endPosition)
      );
      console.log(`  Chunk ${i}: ${chunk.startPosition}-${chunk.endPosition} ${inRange ? '✅' : '❌'} (dist: ${distance}) (${chunk.text.substring(0, 30)}...)`);
    }

    let targetChunkIndex = chunks.findIndex(c => textOffset >= c.startPosition && textOffset <= c.endPosition);
    if (targetChunkIndex === -1) {
      console.log(`⚠️ Text offset ${textOffset} not found in any chunk range!`);

      // Find the closest chunk by distance to help debug
      let closestChunk = 0;
      let minDistance = Math.abs(textOffset - chunks[0].startPosition);
      for (let i = 1; i < chunks.length; i++) {
        const startDist = Math.abs(textOffset - chunks[i].startPosition);
        const endDist = Math.abs(textOffset - chunks[i].endPosition);
        const dist = Math.min(startDist, endDist);
        if (dist < minDistance) {
          minDistance = dist;
          closestChunk = i;
        }
      }

      console.log(`🔍 Closest chunk is ${closestChunk} (distance: ${minDistance}), using it as fallback`);
      targetChunkIndex = closestChunk;
    } else {
      console.log(`✅ Found target chunk ${targetChunkIndex} for offset ${textOffset}`);
    }

    // Pause current playback immediately if we're playing
    const wasPlaying = state.isPlaying && !state.isPaused;
    if (wasPlaying) {
      console.log('⏸️ Pausing playback for seek to unsynthesized chunk');
      // Stop current playback immediately to prevent confusion
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      }
      setState(prev => ({ ...prev, isPlaying: false, isPaused: true }));
    }

    // Ensure target chunk is synthesized
    if (!chunkBuffersRef.current.has(targetChunkIndex)) {
      console.log(`🎤 Synthesizing target chunk ${targetChunkIndex}`);

      // Set loading state with specific message for synthesis
      setState(prev => ({
        ...prev,
        isLoading: true,
        isSynthesizing: true
      }));

      // Call onError callback to show user feedback
      optionsRef.current.onError?.('Preparing audio for selected position...');

      try {
        await synthesizeChunk(targetChunkIndex);
      } catch (error) {
        console.error(`❌ Failed to synthesize chunk ${targetChunkIndex}:`, error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          isSynthesizing: false,
          isSeeking: false
        }));
        isSeekingRef.current = false;
        optionsRef.current.onError?.('Failed to prepare audio for selected position');
        return;
      }

      // Clear synthesis loading state and notify success
      setState(prev => ({
        ...prev,
        isLoading: false,
        isSynthesizing: false
      }));

      // Notify that audio is ready
      optionsRef.current.onError?.('Audio ready - starting playback...');
    }

    // Double-check chunk is ready
    if (!chunkBuffersRef.current.has(targetChunkIndex)) {
      console.log(`❌ Chunk ${targetChunkIndex} still not ready after synthesis`);
      isSeekingRef.current = false;
      setState(prev => ({ ...prev, isSeeking: false }));
      optionsRef.current.onError?.('Audio preparation failed - please try again');
      return;
    }

    const chunkBuffer = chunkBuffersRef.current.get(targetChunkIndex)!;
    const boundaries = chunkBuffer.wordBoundaries || [];
    let offsetInChunk = 0;
    if (boundaries.length > 0) {
      // Prefer the nearest prior boundary (<= textOffset) to avoid starting ahead
      let chosen = boundaries[0];
      for (let i = 0; i < boundaries.length; i++) {
        if (boundaries[i].absoluteTextPosition <= textOffset) {
          chosen = boundaries[i];
        } else {
          break;
        }
      }
      const PREROLL = 0.05; // 50ms
      offsetInChunk = Math.max(0, Math.min(chunkBuffer.audioBuffer.duration - 0.05, chosen.offset - PREROLL));
      console.log(`🎵 Chose boundary: "${chosen.word}" at absolute pos ${chosen.absoluteTextPosition}, audio offset: ${offsetInChunk.toFixed(2)}s`);
    }    // Stop existing playback
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.onended = null; sourceNodeRef.current.stop(); } catch { }
      try { sourceNodeRef.current.disconnect(); } catch { }
      sourceNodeRef.current = null;
    }
    if (wordBoundaryTimerRef.current) { clearInterval(wordBoundaryTimerRef.current); wordBoundaryTimerRef.current = null; }

    // Update indices and baseline - CRITICAL: Set this before starting playback
    console.log(`🎯 Setting currentChunkIndexRef from ${currentChunkIndexRef.current} to ${targetChunkIndex}`);
    currentChunkIndexRef.current = targetChunkIndex;

    // Proactively buffer chunks ahead of the seek target
    queueChunksForSynthesis(targetChunkIndex + 1, BUFFER_SIZE);

    // Resume audio if needed
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    // Start playback at boundary offset
    chunkStartTimeRef.current = audioContextRef.current.currentTime;
    currentChunkStartOffsetRef.current = offsetInChunk;

    // Clear seeking flag AFTER we've set the chunk index correctly and wait a bit
    // This prevents race conditions with automatic chunk progression
    console.log(`🎯 Starting playback of chunk ${targetChunkIndex} at offset ${offsetInChunk.toFixed(2)}s`);

    // Small delay to ensure all async operations settle
    await new Promise(resolve => setTimeout(resolve, 100));

    // Start playback at the target position
    await playCurrentChunk(offsetInChunk);

    // If we were playing before the seek, resume automatically
    if (wasPlaying) {
      console.log('▶️ Auto-resuming playback after seek to synthesized chunk');
      setState(prev => ({ ...prev, isPlaying: true, isPaused: false }));
    }

    // Clear seeking flags after a small delay to ensure everything is settled
    setTimeout(() => {
      isSeekingRef.current = false;
      setState(prev => ({ ...prev, isSeeking: false }));
    }, 200);
  }, [synthesizeChunk, playCurrentChunk]);

  // Relative seek by seconds within/around current chunk
  const seekBySeconds = useCallback(async (deltaSeconds: number) => {
    if (!audioContextRef.current) return;

    let idx = currentChunkIndexRef.current;

    // Determine current time in chunk
    let timeInChunk = 0;
    if (state.isPaused) {
      timeInChunk = pausedTimeInChunkRef.current;
    } else {
      const elapsedSinceStart = audioContextRef.current.currentTime - chunkStartTimeRef.current;
      timeInChunk = Math.max(0, currentChunkStartOffsetRef.current + elapsedSinceStart);
    }

    let targetIndex = idx;
    let targetOffset = timeInChunk + deltaSeconds;

    // Ensure current chunk buffer exists
    if (!chunkBuffersRef.current.get(targetIndex)) {
      await synthesizeChunk(targetIndex);
    }
    let guard = 0;
    while (guard++ < 100) {
      const buf = chunkBuffersRef.current.get(targetIndex);
      if (!buf) {
        await synthesizeChunk(targetIndex);
        continue;
      }
      if (targetOffset < 0) {
        // move to previous chunk
        if (targetIndex === 0) { targetOffset = 0; break; }
        const prevIdx = targetIndex - 1;
        if (!chunkBuffersRef.current.has(prevIdx)) { await synthesizeChunk(prevIdx); }
        const prevBuf = chunkBuffersRef.current.get(prevIdx)!;
        targetIndex = prevIdx;
        targetOffset += prevBuf.duration;
        continue;
      }
      if (targetOffset > buf.duration - 0.05) {
        // move to next chunk
        if (targetIndex >= chunksRef.current.length - 1) { targetOffset = Math.max(0, buf.duration - 0.05); break; }
        const nextIdx = targetIndex + 1;
        if (!chunkBuffersRef.current.has(nextIdx)) { await synthesizeChunk(nextIdx); }
        const curDur = buf.duration;
        targetOffset -= curDur;
        targetIndex = nextIdx;
        continue;
      }
      break;
    }

    // If we have word boundaries for the target chunk, snap to the nearest prior boundary and apply preroll
    const targetBufForSnap = chunkBuffersRef.current.get(targetIndex);
    if (targetBufForSnap && targetBufForSnap.wordBoundaries && targetBufForSnap.wordBoundaries.length > 0) {
      const boundaries = targetBufForSnap.wordBoundaries;
      // find last boundary with offset <= targetOffset
      let bi = -1;
      for (let i = 0; i < boundaries.length; i++) {
        if (boundaries[i].offset <= targetOffset) bi = i; else break;
      }
      if (bi >= 0) {
        const PREROLL = 0.05;
        targetOffset = Math.max(0, Math.min(targetBufForSnap.audioBuffer.duration - 0.05, boundaries[bi].offset - PREROLL));
      } else {
        targetOffset = Math.max(0, targetOffset - 0.05);
      }
    } else {
      targetOffset = Math.max(0, targetOffset - 0.05);
    }

    // Stop existing playback and timers
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.onended = null; sourceNodeRef.current.stop(); } catch { }
      try { sourceNodeRef.current.disconnect(); } catch { }
      sourceNodeRef.current = null;
    }
    if (wordBoundaryTimerRef.current) { clearInterval(wordBoundaryTimerRef.current); wordBoundaryTimerRef.current = null; }

    // Update current chunk index and baseline
    currentChunkIndexRef.current = targetIndex;
    // No baseline tracking

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    chunkStartTimeRef.current = audioContextRef.current.currentTime;
    currentChunkStartOffsetRef.current = targetOffset;
    await playCurrentChunk(targetOffset);
  }, [state.isPaused, synthesizeChunk, playCurrentChunk]);

  const setRate = useCallback(async (newRate: number) => {
    if (!textRef.current || newRate === state.rate) return;

    console.log(`🎛️ Changing rate from ${state.rate} to ${newRate}`);

    // Update rate in options ref immediately so synthesizeChunk picks it up
    optionsRef.current = { ...optionsRef.current, rate: newRate };
    setState(prev => ({ ...prev, rate: newRate }));

    // If we have text loaded, re-synthesize with new rate
    if (textRef.current && chunksRef.current.length > 0) {
      const wasPlaying = state.isPlaying && !state.isPaused;
      const wasPaused = state.isPaused;
      let currentPosition = 0;

      // Capture current position if playing/paused
      if (wasPlaying || wasPaused) {
        const pos = getCurrentPosition();
        currentPosition = pos?.absoluteTextPosition || 0;
        console.log(`📍 Captured position: ${currentPosition} before rate change, wasPlaying: ${wasPlaying}, wasPaused: ${wasPaused}`);
      }

      // Stop current playback if it was playing
      if (wasPlaying) {
        pause();
      }

      try {
        // Clear existing buffers and re-synthesize with new rate
        chunkBuffersRef.current.clear();
        setState(prev => ({ ...prev, chunksReady: 0, readyTextMaxOffset: 0 }));

        // Re-synthesize the text with new rate
        await synthesizeText(textRef.current, true);

        // Restore position if we had one, regardless of whether we were playing or paused
        if (currentPosition > 0) {
          console.log(`🎯 Seeking back to position ${currentPosition} after rate change`);
          await seekToTextOffset(currentPosition);

          // Only resume playback if we were actually playing (not paused)
          if (wasPlaying) {
            // Position is already set by seekToTextOffset, it will start playing
          }
        } else if (wasPlaying) {
          // If no position was captured but we were playing, start from beginning
          await play();
        }
      } catch (error) {
        console.error('❌ Error applying rate change:', error);
        optionsRef.current.onError?.('Failed to change playback rate');
      }
    }
  }, [state.rate, state.isPlaying, state.isPaused, getCurrentPosition, pause, synthesizeText, seekToTextOffset, play]);


  return {
    ...state,
    synthesizeText,
    play,
    pause,
    resume,
    resumeFromPosition,
    stop,
    reset,
    getCurrentPosition,
    seekToTextOffset,
    seekBySeconds,
    setRate,
  };
};