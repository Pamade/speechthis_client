import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { normalizeTextForTTS } from "../../utils/pdfUtils";
import styles from "./PdfViewer.module.scss";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './PdfViewer.scss';
import throttle from 'lodash.throttle';
import { FaSearchMinus, FaSearchPlus, FaSyncAlt } from "react-icons/fa";

const DEFAULT_MIN_ZOOM = 0.35;
const DEFAULT_MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PdfViewerProps {
  file: string | { data: ArrayBuffer } | null;
  isPlaying?: boolean;
  currentWord?: string;
  currentTextPosition: number | null;
  onTextExtracted?: (text: string) => void;
  setIsLoading?: (loading: boolean) => void;
  isSeeking?: boolean;
  // Max absolute text position that has synthesized word boundaries available
  readyTextMaxOffset?: number;
  // Callback to request a TTS seek to a specific absolute text offset
  onRequestSeekToTextOffset?: (textOffset: number) => void;
  // Controlled zoom level; if omitted, the viewer manages zoom internally
  zoomLevel?: number;
  // Callback invoked when zoom changes (includes manual vs. automatic intent)
  onZoomChange?: (value: number, options?: { isManual?: boolean }) => void;
  // Optional overrides for zoom boundaries
  minZoom?: number;
  maxZoom?: number;
}

interface WordPosition {
  word: string;
  textOffset: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Optional: number of merged tokens and the last merged index (for composites)
  mergedCount?: number;
  lastIndex?: number;
}

const deriveDefaultZoom = (width: number): number => {
  if (width < 480) return 0.35;
  if (width < 768) return 0.6;
  if (width < 1200) return 0.8;
  return 1;
};

const PdfViewer: React.FC<PdfViewerProps> = ({
  file,
  isPlaying,
  currentWord,
  currentTextPosition,
  onTextExtracted,
  setIsLoading,
  isSeeking,
  readyTextMaxOffset,
  onRequestSeekToTextOffset,
  zoomLevel,
  onZoomChange,
  minZoom,
  maxZoom
}) => {
  const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;

  // Core state
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [screenWidth, setScreenWidth] = useState(initialWidth);
  const [internalZoom, setInternalZoom] = useState(() => deriveDefaultZoom(initialWidth));
  const [renderEpoch, setRenderEpoch] = useState(0);
  const [wordPositions, setWordPositions] = useState<WordPosition[]>([]);
  const [hoveredWord, setHoveredWord] = useState<WordPosition | null>(null);
  const [isPdfTrimmed, setIsPdfTrimmed] = useState<boolean>(false);
  const [isReRendering, setIsReRendering] = useState<boolean>(false);
  // E-book experience state
  const [currentReadingIndex, setCurrentReadingIndex] = useState<number>(0);
  const [isSeekDetected, setIsSeekDetected] = useState<boolean>(false);
  const currentReadingIndexRef = useRef(0);
  const [azureToVisualMapping, setAzureToVisualMapping] = useState<Map<number, number>>(new Map());
  // Recent anchors linking Azure char offset to visual index
  const [anchors, setAnchors] = useState<Array<{ pos: number; index: number }>>([]);
  // Drift compensation between Azure normalized offsets and our computed offsets
  const [azureOffsetDelta, setAzureOffsetDelta] = useState<number>(0);
  const hasRebasedAfterSeekRef = useRef(false);
  // Clamp drift updates for the first few matches post-seek
  const driftClampCounterRef = useRef(0);
  // Track text position at the moment seek starts, to detect first post-seek boundary
  const seekStartTextPosRef = useRef<number | null>(null);

  // Refs
  useEffect(() => { currentReadingIndexRef.current = currentReadingIndex; }, [currentReadingIndex]);
  const renderEpochRef = useRef(renderEpoch);
  const pageDoneSetRef = useRef<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAlignedInThisSeekRef = useRef(false);
  // Allow a one-time global realignment when playback resumes
  const allowOneTimeRealignRef = useRef<boolean>(false);
  const prevIsPlayingRef = useRef<boolean>(false);
  // Pending highlight gating when seeking into unsynthesized area
  const pendingHighlightRef = useRef<{ word: string; pos: number } | null>(null);
  // Map from Text node to span normalization info for precise click-to-offset mapping
  const spanInfoMapRef = useRef<Map<Node, { normStart: number; originalToNorm: number[]; text: string }>>(new Map());
  const internalZoomManualRef = useRef(false);
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  // Cache for container bounding rect (C optimization)
  const containerRectCacheRef = useRef<DOMRect | null>(null);

  useEffect(() => { renderEpochRef.current = renderEpoch; }, [renderEpoch]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      // Clear container rect cache on resize
      containerRectCacheRef.current = null;
    };

    const handleScroll = () => {
      // Clear container rect cache on scroll
      containerRectCacheRef.current = null;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true); // Use capture to catch all scrolls

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current != null) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  // Rebase on first post-seek boundary (top-level effect) — moved below estimator definition

  // We now derive the normalized text from the rendered text layer to match word hitboxes exactly.
  // This avoids mismatches between separate extraction methods.
  useEffect(() => {
    // no-op: text is produced after pages render via extractWordPositions()
  }, []);

  // Extract word positions from rendered PDF
  // Important: compute textOffset in the SAME normalized space you send to Azure (apostrophes removed etc.)
  const extractWordPositions = useCallback(() => {
    if (!containerRef.current) return [];

    const positions: WordPosition[] = [];
    const textSpans = Array.from(containerRef.current.querySelectorAll('.react-pdf__Page__textContent span')) as HTMLElement[];
    let globalNormalizedOffset = 0; // tracks position in normalized text stream (Azure space)
    let inSpaceRunFromPrevSpan = false; // collapse whitespace across span boundaries
    const normalizedParts: string[] = [];

    // Build original->normalized index map for a span using the same rules as normalizeTextForTTS
    // Rules:
    // - Remove apostrophes entirely
    // - Convert en/em dash to '-'
    // - Convert ellipsis … to '...'
    // - Convert any unicode spaces to regular space and collapse consecutive spaces to one
    // - Keep punctuation (.,;:?!"() etc.) as single chars
    const buildOriginalToNormalizedMap = (text: string, inSpaceRunInit: boolean) => {
      const map: number[] = new Array(text.length + 1).fill(0);
      let norm = 0;
      let inSpaceRun = inSpaceRunInit;
      const spanOut: string[] = [];

      // Treat only whitespace and known Unicode space separators as spaces
      const isSpaceLike = (ch: string) => /\s/.test(ch) || /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u200B-\u200D]/.test(ch);

      for (let i = 0; i < text.length; i++) {
        map[i] = norm;
        const ch = text[i];

        // Drop apostrophes (straight, curly, modifier letter, fullwidth)
        if (ch === "'" || ch === "\u2019" || ch === "\u2018" || ch === "\u02BC" || ch === "\uFF07") {
          inSpaceRun = false;
          continue;
        }

        // Ellipsis -> '...'
        if (ch === "\u2026") {
          norm += 3;
          spanOut.push('.', '.', '.');
          inSpaceRun = false;
          continue;
        }

        // Dashes -> '-'
        if (ch === "\u2013" || ch === "\u2014") {
          norm += 1;
          spanOut.push('-');
          inSpaceRun = false;
          continue;
        }

        // Space-like -> collapse runs to single space
        if (isSpaceLike(ch)) {
          if (!inSpaceRun) {
            norm += 1; // first space in a run
            spanOut.push(' ');
            inSpaceRun = true;
          }
          continue;
        }

        // All other characters count as one
        norm += 1;
        spanOut.push(ch.toLowerCase());
        inSpaceRun = false;
      }

      map[text.length] = norm;
      return { map, normalizedSpanLength: norm, endedInSpaceRun: inSpaceRun, spanNormalizedText: spanOut.join('') };
    };

    for (let s = 0; s < textSpans.length; s++) {
      const element = textSpans[s];
      const text = element.textContent || '';
      const textNode = element.firstChild as Text;

      if (!text || !textNode || textNode.nodeType !== Node.TEXT_NODE) {
        // Skip non-text spans
        continue;
      }

      // Build original->normalized index map for this span aligned with Azure normalized text
      const spanNormStart = globalNormalizedOffset;
      const { map: originalToNorm, normalizedSpanLength, endedInSpaceRun, spanNormalizedText } = buildOriginalToNormalizedMap(
        text,
        inSpaceRunFromPrevSpan
      );

      // Store mapping for precise click-to-text offset mapping later
      if (textNode) {
        spanInfoMapRef.current.set(textNode, { normStart: spanNormStart, originalToNorm, text });
      }

      // Accumulate normalized text for this span
      if (spanNormalizedText) {
        normalizedParts.push(spanNormalizedText);
      }

      // Extract words from this span - process each occurrence individually
      // Use Unicode-aware matching so accented and non-Latin characters are treated as part of words
      const wordRegex = /[\p{L}\p{N}][\p{L}\p{M}\p{N}'\u2019\u2018\u02BC\uFF07.-]*/gu;
      let match;

      while ((match = wordRegex.exec(text)) !== null) {
        const word = match[0];
        const wordIndex = match.index;

        // Debug logging for words with dots or apostrophes
        if (word.includes('.') || word.includes("'") || word.includes('\u2019')) {
          console.log(`📝 Tokenized word: "${word}" at index ${wordIndex} in span: "${text}"`);
        }

        try {
          const range = document.createRange();
          range.setStart(textNode, wordIndex);
          range.setEnd(textNode, wordIndex + word.length);

          const rect = range.getBoundingClientRect();
          const containerRect = containerRef.current!.getBoundingClientRect();

          if (rect.width > 0 && rect.height > 0) {
            // Map original start index within this span to normalized offset
            const normalizedStartInSpan = originalToNorm[wordIndex] || 0;
            positions.push({
              word,
              // Set offset in normalized coordinate space (aligned with Azure positions)
              textOffset: globalNormalizedOffset + normalizedStartInSpan,
              rect: {
                x: rect.left - containerRect.left,
                y: rect.top - containerRect.top,
                width: rect.width,
                height: rect.height
              }
            });
          }
        } catch (error) {
          // Skip problematic words
        }
      }

      // Advance global normalized offset by normalized length of this span
      globalNormalizedOffset += normalizedSpanLength;
      // Carry over whether we ended in a space run to collapse across spans
      inSpaceRunFromPrevSpan = endedInSpaceRun;

      // Heuristic: add a single space between spans when they likely represent separate words
      if (s < textSpans.length - 1) {
        const currSpanRect = element.getBoundingClientRect();
        const nextSpanRect = (textSpans[s + 1] as HTMLElement).getBoundingClientRect();
        const gapPx = nextSpanRect.left - currSpanRect.right;
        const verticalGap = Math.abs(nextSpanRect.top - currSpanRect.top);

        const avgHeight = Math.max(currSpanRect.height, nextSpanRect.height, 12);
        const isLineBreak = verticalGap > avgHeight * 0.5;

        let shouldAddSpace = false;

        // Rule 1: If it's a clear line break, add a space.
        if (isLineBreak) {
          shouldAddSpace = true;
        }
        // Rule 2: If on the same line, add a space only if there's a visible horizontal gap.
        else if (gapPx > 1) {
          shouldAddSpace = true;
        }

        // Rule 3: If the normalization of the current span already ended in a space,
        // we must not add another one. This prevents double spaces.
        if (inSpaceRunFromPrevSpan) {
          shouldAddSpace = false;
        }

        if (shouldAddSpace) {
          globalNormalizedOffset += 1;
          inSpaceRunFromPrevSpan = true; // Mark that we've just added a space.
          normalizedParts.push(' ');
        }
      }
    }

    // Provide both sorted positions and the exact normalized text that matches offsets
    const sorted = positions.sort((a, b) => a.textOffset - b.textOffset);

    // Debug: Check consistency by looking for "Geographical" specifically
    const geoWords = sorted.filter(w => w.word.toLowerCase().includes('geographical'));
    if (geoWords.length > 0) {

    }

    // Debug: Log first and last few word positions
    if (sorted.length > 0) {

      sorted.slice(0, 5).forEach((pos, i) => {
        console.log(`  ${i}: "${pos.word}" at offset ${pos.textOffset}`);
      });

      sorted.slice(-5).forEach((pos, i) => {
        console.log(`  ${sorted.length - 5 + i}: "${pos.word}" at offset ${pos.textOffset}`);
      });

    }

    // Return as a tuple-like object for callers that want full text
    // @ts-ignore – existing callers expecting array will still work by using the 'positions' property
    (sorted as any).positions = sorted;
    // @ts-ignore
    (sorted as any).normalizedText = normalizedParts.join('');
    return sorted as any;
  }, []);

  // Create position mapping for better Azure alignment
  const createPositionMapping = useCallback(() => {
    if (wordPositions.length === 0) return;

    const mapping = new Map<number, number>();

    // Create calibration points more densely (every 10 words) for better interpolation
    for (let i = 0; i < wordPositions.length; i += 10) {
      const visualWord = wordPositions[i];
      mapping.set(visualWord.textOffset, i);
    }

    setAzureToVisualMapping(mapping);
  }, [wordPositions]);

  // Estimate visual index from Azure position via binary search on textOffset
  const estimateVisualIndex = useCallback((azurePosition: number): number => {
    if (wordPositions.length === 0) return 0;
    const effective = Math.max(0, azurePosition + azureOffsetDelta);

    // If we have anchors, use them to estimate index via linear extrapolation/interpolation
    if (anchors.length > 0) {
      const last = anchors[anchors.length - 1];
      // If we have at least two anchors, compute slope (words per char)
      let slope = 1 / 5; // default ~5 chars per word
      if (anchors.length >= 2) {
        const prev = anchors[anchors.length - 2];
        const dPos = last.pos - prev.pos;
        const dIdx = last.index - prev.index;
        if (Math.abs(dPos) > 0) slope = dIdx / dPos;
      }
      const estimated = Math.round(last.index + slope * (effective - last.pos));
      return Math.max(0, Math.min(wordPositions.length - 1, estimated));
    }

    // Fallback: binary search by textOffset
    let lo = 0;
    let hi = wordPositions.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const off = wordPositions[mid].textOffset;
      if (off === effective) return mid;
      if (off < effective) lo = mid + 1; else hi = mid - 1;
    }
    const cand = [hi, lo].filter(i => i >= 0 && i < wordPositions.length);
    if (cand.length === 0) return 0;
    let best = cand[0];
    let bestDist = Math.abs(wordPositions[best].textOffset - effective);
    for (const i of cand) {
      const d = Math.abs(wordPositions[i].textOffset - effective);
      if (d < bestDist) { best = i; bestDist = d; }
    }
    return best;
  }, [wordPositions, azureOffsetDelta, anchors]);

  // Rebase on first post-seek boundary (runs after estimator exists)
  useEffect(() => {
    // Only rebase after seek completes and we receive the first NEW boundary
    if (!isSeekDetected) return;
    if (isSeeking) return; // wait until seek finished
    if (currentTextPosition == null) return;
    if (hasRebasedAfterSeekRef.current) return;

    // Skip if text position hasn't advanced since seek start (stale value)
    if (seekStartTextPosRef.current == null) return;
    if (currentTextPosition === seekStartTextPosRef.current) return;

    const idx = estimateVisualIndex(currentTextPosition);
    setCurrentReadingIndex(idx);
    setAnchors([{ pos: currentTextPosition, index: idx }]);
    setAzureOffsetDelta(0);
    driftClampCounterRef.current = 5; // clamp first few EMA updates post-seek
    hasRebasedAfterSeekRef.current = true;
  }, [isSeekDetected, isSeeking, currentTextPosition, estimateVisualIndex]);

  const createHighlight = useCallback((position: WordPosition) => {
    if (!containerRef.current) return;
    // Skip highlighting if PDF is being re-rendered (zoom change, etc.)
    if (isReRendering) return;

    // Clear existing highlights
    const existingHighlights = containerRef.current.querySelectorAll('.word-highlight');
    existingHighlights.forEach(highlight => highlight.remove());

    // Create new highlight
    const highlightElement = document.createElement('div');
    highlightElement.className = 'word-highlight';
    highlightElement.dataset.textOffset = String(position.textOffset);
    highlightElement.style.cssText = `
    position: absolute;
    left: ${position.rect.x - 2}px;
    top: ${position.rect.y}px;
    width: ${position.rect.width}px;
    height: ${position.rect.height}px;
    background-color: rgba(255, 193, 7, 0.4);
    border: 2px solid rgba(255, 193, 7, 0.8);
    border-radius: 3px;
    pointer-events: none;
    z-index: 1000;
    transition: all 0.15s ease;
  `;

    containerRef.current.appendChild(highlightElement);
  }, [isReRendering]);

  const scrollWordIntoView = useCallback((rect: WordPosition['rect']) => {
    const container = containerRef.current;
    if (!container) return;
    if (!isPlaying && !isSeeking) return;
    if (isUserScrollingRef.current) return;

    // Get the word's position relative to the viewport (not the container)
    const containerRect = container.getBoundingClientRect();
    const wordTopInViewport = containerRect.top + rect.y;
    const wordBottomInViewport = wordTopInViewport + rect.height;

    // Account for audio player bar at the bottom (approximately 80-100px)
    const audioPlayerBarHeight = 100;
    const viewportHeight = window.innerHeight;
    const effectiveViewportHeight = viewportHeight - audioPlayerBarHeight;

    // Define comfort zone: 20% from top, leave space for audio bar at bottom
    const comfortZoneTop = viewportHeight * 0.20;
    const comfortZoneBottom = effectiveViewportHeight * 0.80;

    // Check if word is in the comfort zone
    const isInComfortZone =
      wordTopInViewport >= comfortZoneTop &&
      wordBottomInViewport <= comfortZoneBottom;

    if (isInComfortZone) {
      return; // Word is already visible in a good position
    }

    // Calculate target scroll position to place word at 30% from top
    const targetWordTopInViewport = viewportHeight * 0.30;
    const currentScrollY = window.scrollY || window.pageYOffset;
    const targetScrollY = currentScrollY + (wordTopInViewport - targetWordTopInViewport);

    // Perform the scroll
    isProgrammaticScrollRef.current = true;
    window.scrollTo({
      top: Math.max(0, targetScrollY),
      behavior: 'smooth'
    });

    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 600);
  }, [isPlaying, isSeeking]);

  const highlightSingleWord = useCallback((_targetWord: string, azurePosition: number) => {
    if (wordPositions.length === 0) return;

    const effectiveAzurePos = Math.max(0, azurePosition + azureOffsetDelta);

    // Simplified search: Find the word with the closest textOffset
    let bestCandidate: WordPosition | null = null;
    let minDistance = Infinity;

    // Heuristic: define a search window around the estimated index to avoid scanning all words
    const estimatedIndex = estimateVisualIndex(effectiveAzurePos);
    const searchRadius = isSeekDetected ? 100 : 40; // Wider search on seek
    const startIndex = Math.max(0, estimatedIndex - searchRadius);
    const endIndex = Math.min(wordPositions.length, estimatedIndex + searchRadius);

    for (let i = startIndex; i < endIndex; i++) {
      const pos = wordPositions[i];
      const distance = Math.abs(pos.textOffset - effectiveAzurePos);

      if (distance < minDistance) {
        minDistance = distance;
        bestCandidate = pos;
      }
    }

    // If a candidate is found, highlight it
    if (bestCandidate) {
      createHighlight(bestCandidate);
      scrollWordIntoView(bestCandidate.rect);
      const wordIndex = wordPositions.findIndex(w => w === bestCandidate);

      if (wordIndex !== -1) {
        setCurrentReadingIndex(wordIndex);

        // Alignment and drift correction logic
        if (isSeekDetected && !hasAlignedInThisSeekRef.current) {
          hasAlignedInThisSeekRef.current = true;
          setIsSeekDetected(false);
          setAnchors([{ pos: azurePosition, index: wordIndex }]);
          setAzureOffsetDelta(0);
        } else {
          const deltaSample = bestCandidate.textOffset - azurePosition;
          const clampedSample = driftClampCounterRef.current > 0 ? Math.max(-50, Math.min(50, deltaSample)) : deltaSample;
          setAzureOffsetDelta(prev => Math.round(prev * 0.8 + clampedSample * 0.2));
          if (driftClampCounterRef.current > 0) driftClampCounterRef.current -= 1;
          setAnchors(prev => [...prev.slice(-3), { pos: azurePosition, index: wordIndex }]);
        }
      }
    }
  }, [wordPositions, createHighlight, isSeekDetected, estimateVisualIndex, azureOffsetDelta, scrollWordIntoView]);

  // Find and highlight word with sequential logic
  const highlightWord = useCallback((targetWord: string, azurePosition: number) => {
    if (wordPositions.length === 0) return;

    // Check if Azure sent multiple words as one boundary (contains spaces)
    if (targetWord.includes(' ')) {
      // Split the Azure word into individual words
      const azureWords = targetWord.split(/\s+/).filter(Boolean);

      // Compute per-subword Azure offsets using the same normalization rules
      let prefix = '';
      for (let i = 0; i < azureWords.length; i++) {
        const word = azureWords[i];
        const offsetForThisWord = azurePosition + normalizeTextForTTS(prefix).length;
        // Process synchronously to avoid racing the next Azure boundary
        highlightSingleWord(word, offsetForThisWord);
        prefix += (prefix ? ' ' : '') + word;
      }
      return;
    }

    // Single word highlighting (existing logic)
    highlightSingleWord(targetWord, azurePosition);
  }, [wordPositions, highlightSingleWord]);

  // Event delegation for click-to-seek (replaces individual hitboxes for performance)
  const handleMouseMove = useCallback(throttle((e: React.MouseEvent) => {
    if (wordPositions.length === 0 || !containerRef.current) return;

    // Use cached container rect (C optimization)
    if (!containerRectCacheRef.current) {
      containerRectCacheRef.current = containerRef.current.getBoundingClientRect();
    }
    const containerRect = containerRectCacheRef.current;

    const moveX = e.clientX - containerRect.left;
    const moveY = e.clientY - containerRect.top;

    // Find the word the cursor is over
    const wordUnderCursor = wordPositions.find(word => {
      return moveX >= word.rect.x &&
        moveX <= word.rect.x + word.rect.width &&
        moveY >= word.rect.y &&
        moveY <= word.rect.y + word.rect.height;
    });

    if (wordUnderCursor) {
      if (hoveredWord !== wordUnderCursor) {
        setHoveredWord(wordUnderCursor);
      }
    } else {
      if (hoveredWord !== null) {
        setHoveredWord(null);
      }
    }
  }, 100), [wordPositions, hoveredWord]); // B optimization: throttle at 100ms instead of debounce 50ms

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!onRequestSeekToTextOffset || wordPositions.length === 0) return;

    // If a word is being hovered, the click is for that word. This is the most accurate method.
    if (hoveredWord) {
      console.log(`🖱️ Clicked hovered word: "${hoveredWord.word}" at text offset: ${hoveredWord.textOffset}`);
      onRequestSeekToTextOffset(hoveredWord.textOffset);
      return;
    }

    // Fallback for touch devices or fast clicks where hover might not register
    // Use cached container rect (C optimization)
    if (!containerRectCacheRef.current) {
      containerRectCacheRef.current = containerRef.current!.getBoundingClientRect();
    }
    const containerRect = containerRectCacheRef.current;

    const clickX = e.clientX - containerRect.left;
    const clickY = e.clientY - containerRect.top;

    const clickedWord = wordPositions.find(word => {
      return clickX >= word.rect.x &&
        clickX <= word.rect.x + word.rect.width &&
        clickY >= word.rect.y &&
        clickY <= word.rect.y + word.rect.height;
    });

    if (clickedWord) {
      console.log(`🖱️ Clicked word (direct): "${clickedWord.word}" at text offset: ${clickedWord.textOffset}`);
      onRequestSeekToTextOffset(clickedWord.textOffset);
    } else {
      console.log(`🖱️ Click was not on any word.`);
    }
  }, [wordPositions, onRequestSeekToTextOffset, hoveredWord]);

  useEffect(() => {
    if (!currentWord || currentTextPosition === null) return;

    // If we're seeking and the target position is beyond what is synthesized, defer highlighting
    if (isSeeking && typeof readyTextMaxOffset === 'number' && currentTextPosition > readyTextMaxOffset) {
      pendingHighlightRef.current = { word: currentWord, pos: currentTextPosition };
      return;
    }

    // Extract word positions on first run
    if (wordPositions.length === 0) {
      const positions = extractWordPositions();
      if (positions) setWordPositions(positions);
      return;
    }

    // Create position mapping if not exists
    if (azureToVisualMapping.size === 0) {
      createPositionMapping();
    }

    // Highlight the current word
    highlightWord(currentWord, currentTextPosition);
  }, [currentWord, currentTextPosition, wordPositions, extractWordPositions, createPositionMapping, azureToVisualMapping]);

  // When readiness advances after a seek, attempt the pending highlight
  useEffect(() => {
    if (!pendingHighlightRef.current) return;
    if (!isSeeking && typeof readyTextMaxOffset === 'number') {
      const { word, pos } = pendingHighlightRef.current;
      if (pos <= readyTextMaxOffset) {
        // Execute the deferred highlight and clear
        highlightWord(word, pos);
        pendingHighlightRef.current = null;
      }
    }
  }, [readyTextMaxOffset, isSeeking, highlightWord]);



  useEffect(() => {
    if (!isPlaying) {
      // Do not reset reading index on pause; preserve position for resume
      setIsSeekDetected(false);
      // Keep current highlight visible when paused
    }
  }, [isPlaying]);

  // Track transitions to playing to permit a one-time realign if needed
  useEffect(() => {
    if (isPlaying && !prevIsPlayingRef.current) {
      allowOneTimeRealignRef.current = true;
    }
    prevIsPlayingRef.current = !!isPlaying;
  }, [isPlaying]);


  useEffect(() => {
    if (isSeeking) {
      // Seeking started: drop stale alignment
      setIsSeekDetected(true);
      setAnchors([]);
      setAzureOffsetDelta(0);
      hasRebasedAfterSeekRef.current = false;
      hasAlignedInThisSeekRef.current = false; // <-- reset: we haven't aligned in this seek yet
      driftClampCounterRef.current = 5; // prepare to clamp drift updates right after seek
      // Remember the last known text position at the moment seek begins
      seekStartTextPosRef.current = currentTextPosition ?? null;
      // Clear any previous pending highlight
      pendingHighlightRef.current = null;
    }
  }, [isSeeking, currentTextPosition]);

  const resolvedMinZoom = minZoom ?? DEFAULT_MIN_ZOOM;
  const resolvedMaxZoom = maxZoom ?? DEFAULT_MAX_ZOOM;
  const defaultZoom = useMemo(() => deriveDefaultZoom(screenWidth), [screenWidth]);
  const clampZoomValue = useCallback(
    (value: number) => Math.min(resolvedMaxZoom, Math.max(resolvedMinZoom, value)),
    [resolvedMaxZoom, resolvedMinZoom]
  );
  const isControlledZoom = typeof zoomLevel === 'number';
  useEffect(() => {
    if (!isControlledZoom && !internalZoomManualRef.current) {
      internalZoomManualRef.current = false;
      setInternalZoom(defaultZoom);
    }
  }, [defaultZoom, isControlledZoom]);

  const effectiveZoom = isControlledZoom
    ? clampZoomValue(zoomLevel as number)
    : clampZoomValue(internalZoom);

  const updateZoom = useCallback((next: number, options?: { isManual?: boolean }) => {
    const clamped = clampZoomValue(next);
    if (isControlledZoom) {
      onZoomChange?.(clamped, options);
    } else {
      internalZoomManualRef.current = options?.isManual ?? true;
      setInternalZoom(clamped);
    }
    // Clear bounding box cache to ensure accurate hit-testing after zoom changes
    containerRectCacheRef.current = null;
    isUserScrollingRef.current = false;
  }, [clampZoomValue, isControlledZoom, onZoomChange]);

  const handleZoomIn = useCallback(() => {
    updateZoom(effectiveZoom + ZOOM_STEP, { isManual: true });
  }, [effectiveZoom, updateZoom]);

  const handleZoomOut = useCallback(() => {
    updateZoom(effectiveZoom - ZOOM_STEP, { isManual: true });
  }, [effectiveZoom, updateZoom]);

  const handleResetZoom = useCallback(() => {
    internalZoomManualRef.current = false;
    updateZoom(defaultZoom, { isManual: false });
  }, [defaultZoom, updateZoom]);

  const zoomPercentage = useMemo(() => Math.round(effectiveZoom * 100), [effectiveZoom]);
  const scale = effectiveZoom;

  const handleWindowScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) {
      return;
    }
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current != null) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false;
      userScrollTimeoutRef.current = null;
    }, 2000); // 2 seconds to allow user control
  }, []);

  // Attach scroll listener to window instead of container
  useEffect(() => {
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
    };
  }, [handleWindowScroll]);

  // Check if the first page is trimmed (exceeds viewport width)
  const checkIfPdfTrimmed = useCallback(() => {
    if (!containerRef.current) return;

    // Find the first page canvas
    const firstPageCanvas = containerRef.current.querySelector('.react-pdf__Page canvas') as HTMLCanvasElement;
    if (!firstPageCanvas) return;

    const canvasWidth = firstPageCanvas.getBoundingClientRect().width;
    const viewportWidth = window.innerWidth;

    // Check if content is trimmed (canvas wider than viewport)
    const isTrimmed = canvasWidth > viewportWidth;
    setIsPdfTrimmed(isTrimmed);
  }, []);

  // Re-check if PDF is trimmed when zoom or screen width changes
  useEffect(() => {
    if (numPages > 0 && screenWidth < 768) {
      // Small delay to ensure canvas has re-rendered with new zoom
      const timer = setTimeout(() => checkIfPdfTrimmed(), 150);
      return () => clearTimeout(timer);
    }
  }, [effectiveZoom, screenWidth, numPages, checkIfPdfTrimmed]);

  // Document handlers
  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    pageDoneSetRef.current = new Set();
    setRenderEpoch(e => e + 1);
  };

  const handleDocumentLoadError = (_error: Error) => {
    setError("Failed to load the document. Please try again.");
    setIsLoading?.(false);
  };

  useEffect(() => {
    if (numPages > 0) {
      // Mark that we're re-rendering the PDF
      setIsReRendering(true);
      pageDoneSetRef.current = new Set();
      setRenderEpoch(e => e + 1);
      // Don't clear word positions immediately - keep old ones until new ones are ready
      // This prevents highlighting from breaking during zoom changes
      setAzureToVisualMapping(new Map());
      // Clear container rect cache when PDF reloads
      containerRectCacheRef.current = null;
      // Reset trimmed state when new PDF loads
      setIsPdfTrimmed(false);
    }
  }, [scale, numPages])

  const handlePageRenderSuccess = useCallback((pageNumber: number, epoch: number) => {
    if (renderEpochRef.current !== epoch) return;
    pageDoneSetRef.current.add(pageNumber);

    // Check trimming on first page render
    if (pageNumber === 1 && screenWidth < 768) {
      setTimeout(() => checkIfPdfTrimmed(), 100);
    }

    if (pageDoneSetRef.current.size === numPages) {
      setTimeout(() => {
        if (renderEpochRef.current === epoch) {
          const result: any = extractWordPositions();
          if (result && Array.isArray(result)) {
            setWordPositions(result as WordPosition[]);
            // Clear re-rendering flag once new positions are ready
            setIsReRendering(false);
            // If we also built normalized text, emit it once
            const normalizedText = result && (result as any).normalizedText;
            if (normalizedText && typeof normalizedText === 'string') {
              onTextExtracted?.(normalizedText);
              setIsLoading?.(false);
            }
          }
        }
      }, 500)
    }
  }, [numPages, extractWordPositions, checkIfPdfTrimmed, screenWidth])

  // Determine if we should enable per-page horizontal scroll
  const isMobile = screenWidth < 768;
  const shouldEnablePageScroll = isMobile && isPdfTrimmed;

  const pages = useMemo(() => {
    const pageArray = [];
    for (let i = 1; i <= numPages; i++) {
      const pageElement = (
        <Page
          key={`page_${i}_${renderEpoch}`}
          pageNumber={i}
          scale={scale}
          onRenderSuccess={() => handlePageRenderSuccess(i, renderEpoch)}
          renderTextLayer={true}
          renderAnnotationLayer={true}
        />
      );

      // Wrap each page in a scroll container on mobile when content is trimmed
      if (shouldEnablePageScroll) {
        pageArray.push(
          <div key={`page_wrapper_${i}_${renderEpoch}`} className={styles.pageScrollWrapper}>
            {pageElement}
          </div>
        );
      } else {
        pageArray.push(pageElement);
      }
    }
    return pageArray;
  }, [numPages, scale, renderEpoch, handlePageRenderSuccess, shouldEnablePageScroll])

  if (!file) {
    return (
      <div></div>
    )
  }

  return (
    <div className={styles.kindleWrapper}>
      <div className={styles.zoomControls} role="group" aria-label="Document zoom controls">
        <button
          type="button"
          className={styles.zoomButton}
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <FaSearchMinus />
        </button>
        <button
          type="button"
          className={styles.zoomLevel}
          onClick={handleResetZoom}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleResetZoom();
            }
          }}
          title="Reset zoom"
          aria-label={`Current zoom ${zoomPercentage}% – click to reset`}
        >
          {zoomPercentage}%
        </button>
        <button
          type="button"
          className={styles.zoomButton}
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <FaSearchPlus />
        </button>
        <button
          type="button"
          className={styles.zoomButton}
          onClick={handleResetZoom}
          title="Reset zoom"
          aria-label="Reset zoom"
        >
          <FaSyncAlt />
        </button>
      </div>
      <div
        className={styles.kindleContainer}
        ref={containerRef}
        style={{ position: 'relative', cursor: onRequestSeekToTextOffset ? 'pointer' : 'default' }}
        onClick={handleContainerClick}
        onMouseMove={handleMouseMove}
      >
        {hoveredWord && (
          <div
            className="word-hover-highlight"
            style={{
              position: 'absolute',
              left: `${hoveredWord.rect.x}px`,
              top: `${hoveredWord.rect.y}px`,
              width: `${hoveredWord.rect.width}px`,
              height: `${hoveredWord.rect.height}px`,
            }}
          />
        )}
        {error ? (
          <div className={styles.error}>
            <p>{error}</p>
          </div>
        ) : (
          <Document
            file={file}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            loading={<div>Loading...</div>}
          >
            {pages}
          </Document>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;

