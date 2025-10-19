import { unzip } from "unzipit";

export async function extractTextFromEPUB(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();

    // Rozpakuj EPUB (to zwykły zip)
    const { entries } = await unzip(arrayBuffer);

    let fullText = "";

    for (const [name, entry] of Object.entries(entries)) {
        if (name.endsWith(".xhtml") || name.endsWith(".html") || name.endsWith(".xml")) {
            const content = await entry.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, "application/xhtml+xml");

            // pobierz CAŁY tekst z dokumentu
            const text = doc.documentElement.textContent || "";
            fullText += "\n\n" + text;
        }
    }

    return fullText
        .replace(/\s+/g, " ")  // normalizuj spacje
        .trim();
}