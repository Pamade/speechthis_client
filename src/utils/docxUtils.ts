export const extractTextFromDOCX = async (file: File): Promise<string> => {
    const mammoth = await import('mammoth');

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const result = await mammoth.extractRawText({ arrayBuffer });
                resolve(result.value);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read DOCX file'));
        reader.readAsArrayBuffer(file);
    });
};


export const extractHTMLFromDOCX = async (file: File): Promise<string> => {
    const mammoth = await import('mammoth');

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const { value } = await mammoth.convertToHtml({ arrayBuffer });
                resolve(value);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read DOCX file'));
        reader.readAsArrayBuffer(file);
    });
};