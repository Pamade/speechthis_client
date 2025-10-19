import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Set worker source to the bundled worker file
GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.min.mjs";

// Legacy interface for backward compatibility
interface PDFPage {
  pageNumber: number;
  text: string;
}

// New structured interfaces for improved text extraction
interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
  fontSize: number;
  hasEOL: boolean; // End of line marker
}

interface StructuredPDFPage {
  pageNumber: number;
  items: TextItem[];
  viewport: {
    width: number;
    height: number;
    scale: number;
  };
  text: string; // Reconstructed reading-order text
}

interface WordPosition {
  word: string;
  textStart: number;
  textEnd: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
  lineNumber: number;
  confidence: number; // How confident we are in the positioning
}

interface ExtractedPDFData {
  pages: StructuredPDFPage[];
  fullText: string;
  wordPositions: WordPosition[];
  metadata: {
    totalPages: number;
    extractionMethod: 'structured' | 'fallback' | 'failed';
    hasPositionalData: boolean;
  };
}

// New interface for react-pdf-highlighter compatibility
interface WordHighlightPosition {
  word: string;
  textOffset: number;
  pageNumber: number;
  rects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ExtractedPDFDataWithHighlights {
  fullText: string;
  wordHighlightPositions: WordHighlightPosition[];
}

function filterInvalidUTF8(text: string): string {
  // Remove only truly invalid characters while preserving all Unicode letters, digits, and common punctuation
  // \p{L} matches all Unicode letters (Latin, Cyrillic, Chinese, Arabic, etc.)
  // \p{N} matches all Unicode digits
  // \p{M} matches combining marks (accents, diacritics)
  // \p{P} matches all Unicode punctuation
  // \p{S} matches symbols
  // \s matches whitespace
  return text.replace(/[^\p{L}\p{N}\p{M}\p{P}\p{S}\s\-]/gu, '').replace(/\s+/g, ' ').trim();
}

// Helper function to determine reading order
function sortItemsByReadingOrder(items: any[]): TextItem[] {
  if (!items || !Array.isArray(items)) {
    console.warn('⚠️ Invalid items array provided to sortItemsByReadingOrder');
    return [];
  }

  return items
    .filter(item => {
      // More robust filtering
      return item &&
        item.str &&
        typeof item.str === 'string' &&
        item.str.trim() &&
        item.transform &&
        Array.isArray(item.transform) &&
        item.transform.length >= 6;
    })
    .map(item => {
      // Safe extraction with fallbacks
      const transform = item.transform || [12, 0, 0, 12, 0, 0]; // Default transform matrix
      return {
        str: item.str,
        x: transform[4] || 0,
        y: transform[5] || 0,
        width: item.width || 0,
        height: item.height || 0,
        transform: transform,
        fontName: item.fontName || 'unknown',
        fontSize: Math.abs(transform[0]) || 12,
        hasEOL: item.hasEOL || false
      };
    })
    .sort((a, b) => {
      // Sort by Y coordinate first (top to bottom)
      const yDiff = Math.abs(a.y - b.y);
      const avgHeight = (a.height + b.height) / 2 || 12;

      // If items are on the same line (Y difference is small)
      if (yDiff < avgHeight * 0.5) {
        // Sort by X coordinate (left to right)
        return a.x - b.x;
      }

      // Different lines - sort by Y coordinate (top to bottom)
      return b.y - a.y;
    });
}

export const normalizeTextForTTS = (text: string): string => {
  return text
    // Convert smart quotes to regular quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // REMOVE apostrophes completely (all common variants)
    .replace(/[\'\u2019\u2018\u02BC\uFF07]/g, '')
    // Remove other problematic Unicode characters
    .replace(/[–—]/g, '-') // em dash, en dash to hyphen
    .replace(/…/g, '...') // ellipsis to three dots
    .replace(/[\u2000-\u206F]/g, ' ') // various Unicode spaces to regular space
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // Convert to lowercase for consistent matching
    .toLowerCase();
};

// Reconstruct text in proper reading order with line breaks
function reconstructTextWithLineBreaks(sortedItems: TextItem[]): string {
  if (sortedItems.length === 0) return '';

  let text = '';
  let currentLineY = sortedItems[0].y;
  let lastItem: TextItem | null = null;

  for (const item of sortedItems) {
    const avgHeight = item.height || 12;
    const yDiff = Math.abs(item.y - currentLineY);

    // Detect line break
    if (yDiff > avgHeight * 0.5 && lastItem) {
      text += '\n';
      currentLineY = item.y;
    }
    // Detect word spacing within the same line
    else if (lastItem && item.y === currentLineY) {
      const xGap = item.x - (lastItem.x + (lastItem.width || 0));
      const avgFontSize = (item.fontSize + lastItem.fontSize) / 2;

      // Add space if there's a significant gap
      if (xGap > avgFontSize * 0.2) {
        text += ' ';
      }
    }

    text += item.str;
    lastItem = item;
  }

  return text;
}

// Create word-to-position mapping
function createWordPositionMapping(pages: StructuredPDFPage[]): WordPosition[] {
  const wordPositions: WordPosition[] = [];
  let globalTextOffset = 0;

  for (const page of pages) {
    let lineNumber = 0;
    let currentLineY = null;

    for (const item of page.items) {
      // Detect new line
      if (currentLineY === null || Math.abs(item.y - currentLineY) > (item.height * 0.5)) {
        lineNumber++;
        currentLineY = item.y;
      }

      // Split item text into words
      const words = item.str.split(/(\s+)/);
      let itemOffset = 0;

      for (const word of words) {
        if (word.trim()) { // Skip whitespace-only "words"
          const wordWidth = (item.width || 0) * (word.length / item.str.length);
          const wordX = item.x + (itemOffset / item.str.length) * (item.width || 0);

          wordPositions.push({
            word: word.trim(),
            textStart: globalTextOffset,
            textEnd: globalTextOffset + word.trim().length,
            x: wordX,
            y: item.y,
            width: wordWidth,
            height: item.height,
            pageNumber: page.pageNumber,
            lineNumber,
            confidence: item.str.length > 0 ? 0.9 : 0.5 // Higher confidence for longer text items
          });

          globalTextOffset += word.trim().length;
        }

        itemOffset += word.length;

        // Add space character to global offset if this wasn't the last word
        if (word !== words[words.length - 1] && word.trim()) {
          globalTextOffset += 1;
        }
      }
    }

    // Add page break
    globalTextOffset += 1;
  }

  return wordPositions;
}

// NEW: Enhanced structured extraction
export async function extractStructuredTextFromPDF(file: File): Promise<ExtractedPDFData> {
  console.log('🔄 Starting structured PDF text extraction...');

  // Add timeout protection - longer timeout for large PDFs
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('PDF extraction timeout after 2 minutes'));
    }, 120000); // 2 minutes for large PDFs
  });

  try {
    const extractionPromise = (async () => {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      console.log('📄 Total pages:', pdf.numPages);

      // Prevent processing of extremely large PDFs (increased limit)
      if (pdf.numPages > 500) {
        console.warn(`⚠️ Large PDF detected: ${pdf.numPages} pages. This may take longer to process.`);
        if (pdf.numPages > 1000) {
          throw new Error(`PDF too large: ${pdf.numPages} pages (max 1000 supported)`);
        }
      }

      return pdf;
    })();

    const pdf = await Promise.race([extractionPromise, timeoutPromise]);

    const structuredPages: StructuredPDFPage[] = [];
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`📝 Processing page ${i}/${pdf.numPages}...`);

      try {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        // Validate content items exist
        if (!content.items || !Array.isArray(content.items)) {
          console.warn(`⚠️ Page ${i} has no text content, skipping...`);
          continue;
        }

        // Sort items by reading order
        const sortedItems = sortItemsByReadingOrder(content.items);

        // Reconstruct text with proper line breaks
        const pageText = reconstructTextWithLineBreaks(sortedItems);
        const cleanPageText = filterInvalidUTF8(pageText);

        structuredPages.push({
          pageNumber: i,
          items: sortedItems,
          viewport: {
            width: viewport.width,
            height: viewport.height,
            scale: 1.0
          },
          text: cleanPageText
        });

        fullText += cleanPageText + '\n\n';

      } catch (pageError) {
        console.error(`❌ Error processing page ${i}:`, pageError);
        // Continue with next page instead of failing completely
        continue;
      }
    }

    // Create word position mapping
    console.log('🗺️ Creating word position mapping...');
    const wordPositions = createWordPositionMapping(structuredPages);

    console.log(`✅ Structured extraction complete:`, {
      pages: structuredPages.length,
      totalWords: wordPositions.length,
      textLength: fullText.length
    });

    return {
      pages: structuredPages,
      fullText: fullText.trim(),
      wordPositions,
      metadata: {
        totalPages: pdf.numPages,
        extractionMethod: 'structured',
        hasPositionalData: true
      }
    };

  } catch (error) {
    console.error('❌ Structured extraction failed, falling back to simple extraction:', error);

    try {
      // Fallback to simple extraction with timeout protection
      const fallbackTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Fallback extraction timeout after 60 seconds'));
        }, 60000); // Longer timeout for fallback
      });

      const fallbackExtractionPromise = extractTextFromPDF(file);
      const simplePages = await Promise.race([fallbackExtractionPromise, fallbackTimeoutPromise]);
      const fallbackText = simplePages.map(p => p.text).join('\n\n');

      console.log(`✅ Fallback extraction succeeded: ${simplePages.length} pages, ${fallbackText.length} characters`);

      return {
        pages: simplePages.map(p => ({
          pageNumber: p.pageNumber,
          items: [],
          viewport: { width: 0, height: 0, scale: 1.0 },
          text: p.text
        })),
        fullText: fallbackText,
        wordPositions: [],
        metadata: {
          totalPages: simplePages.length,
          extractionMethod: 'fallback',
          hasPositionalData: false
        }
      };
    } catch (fallbackError) {
      console.error('❌ Both structured and fallback extraction failed:', fallbackError);

      // Final emergency fallback - return minimal structure
      return {
        pages: [],
        fullText: '',
        wordPositions: [],
        metadata: {
          totalPages: 0,
          extractionMethod: 'failed',
          hasPositionalData: false
        }
      };
    }
  }
}

// New function for react-pdf-highlighter compatibility
export async function extractTextWithHighlightPositions(file: File): Promise<ExtractedPDFDataWithHighlights> {
  console.log('🔄 Starting PDF extraction with highlight positions...');
  console.log('📁 File info:', { name: file.name, size: file.size, type: file.type });

  try {
    // Use the structured extraction to get detailed word positions
    console.log('📊 Calling structured extraction...');
    const structuredData = await extractStructuredTextFromPDF(file);
    console.log('✅ Structured extraction completed successfully');

    // Convert WordPosition[] to WordHighlightPosition[]
    console.log('🔄 Converting word positions to highlight format...');
    const wordHighlightPositions: WordHighlightPosition[] = structuredData.wordPositions.map((wp) => {
      // Create a single rect for each word (can be enhanced to handle multi-line words)
      const rect = {
        x: wp.x,
        y: wp.y,
        width: wp.width,
        height: wp.height
      };

      return {
        word: wp.word,
        textOffset: wp.textStart, // Use textStart as the offset
        pageNumber: wp.pageNumber,
        rects: [rect], // Single rect per word
        boundingRect: rect // Same as the single rect
      };
    });

    console.log(`✅ Highlight positions extracted: ${wordHighlightPositions.length} words`);
    console.log('📄 Full text length:', structuredData.fullText.length);

    return {
      fullText: structuredData.fullText,
      wordHighlightPositions
    };

  } catch (error) {
    console.error('❌ Failed to extract highlight positions:', error);

    // Fallback: extract just text without positions
    console.log('🔄 Falling back to simple text extraction...');
    try {
      const simplePages = await extractTextFromPDF(file);
      const fullText = simplePages.map(p => p.text).join('\n\n');

      console.log('✅ Fallback extraction successful, text length:', fullText.length);

      return {
        fullText,
        wordHighlightPositions: []
      };
    } catch (fallbackError) {
      console.error('❌ Fallback extraction also failed:', fallbackError);

      // Final emergency fallback
      return {
        fullText: '',
        wordHighlightPositions: []
      };
    }
  }
}

// Legacy function for backward compatibility - improved for large PDFs
export async function extractTextFromPDF(file: File): Promise<PDFPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  console.log('📄 Simple extraction - Total pages:', pdf.numPages);

  const pages: PDFPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    // Log progress for large PDFs
    if (pdf.numPages > 50 && i % 50 === 0) {
      console.log(`📝 Simple extraction progress: ${i}/${pdf.numPages} pages...`);
    }

    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Safe text extraction
      let text = '';
      if (content.items && Array.isArray(content.items)) {
        text = content.items
          .filter((item: any) => item && item.str && typeof item.str === 'string')
          .map((item: any) => item.str)
          .join(' ');
      }
      const normalizedText = normalizeTextForTTS(text);

      pages.push({
        pageNumber: i,
        text: filterInvalidUTF8(normalizedText)
      });

    } catch (pageError) {
      console.error(`❌ Error extracting page ${i}:`, pageError);
      // Add empty page to maintain page numbering
      pages.push({
        pageNumber: i,
        text: ''
      });
    }
  }

  console.log(`✅ Simple extraction complete: ${pages.length} pages`);
  return pages;
}

// Export types for use in other components
export type { ExtractedPDFData, WordPosition, StructuredPDFPage, TextItem, WordHighlightPosition };