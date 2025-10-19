import React, { useState, useEffect, useMemo, useCallback } from "react";
import {pdfjs } from "react-pdf";


/* -------------------------------
   🔠 Komponent warstwy słów
-------------------------------- */
const WordLayer: React.FC<{ pageNumber: number; scale: number }> = ({
  pageNumber,
  scale,
}) => {
  const [words, setWords] = useState<
    { text: string; left: number; top: number; fontSize: number }[]
  >([]);

  useEffect(() => {
    const fetchWords = async () => {
      const pdf = await pdfjs.getDocument({ url: (window as any).pdfFile }).promise;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      const textContent = await page.getTextContent();
      const wordData: any[] = [];

      textContent.items.forEach((item: any) => {
        if (!item.str.trim()) return;

        // Przekształcenie macierzy transformacji
        const tx = pdfjs.Util.transform(
          viewport.transform,
          item.transform
        );

        const x = tx[4];
        const y = tx[5];

        wordData.push({
          text: item.str,
          left: x,
          top: y - item.height, // poprawka na baseline
          fontSize: item.height,
        });
      });

      setWords(wordData);
    };

    fetchWords();
  }, [pageNumber, scale]);

  return (
    <div
      className="word-layer"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
      }}
    >
      {words.map((w, i) => (
        <span
          key={i}
          className="pdf-word"
          style={{
            position: "absolute",
            left: w.left,
            top: w.top,
            fontSize: w.fontSize,
            whiteSpace: "pre",
          }}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
};
export default WordLayer;