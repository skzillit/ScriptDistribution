const pdfParse = require('pdf-parse');

async function extractTextFromPdf(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return {
      text: data.text,
      pageCount: data.numpages,
      info: data.info,
    };
  } catch (err) {
    console.warn('pdf-parse failed, trying basic extraction:', err.message);
    // Fallback: try with default options only
    try {
      const data = await pdfParse(pdfBuffer, { max: 0 });
      return { text: data.text, pageCount: data.numpages || 1, info: {} };
    } catch (err2) {
      console.warn('Basic pdf-parse also failed:', err2.message);
      return { text: '', pageCount: 1, info: {} };
    }
  }
}

async function extractPagesFromPdf(pdfBuffer) {
  let rawText = '';
  let pageCount = 1;

  try {
    const data = await pdfParse(pdfBuffer);
    rawText = data.text;
    pageCount = data.numpages || 1;
  } catch (err) {
    console.warn('pdf-parse extraction error:', err.message);
    // Return single page with empty text as fallback
    return {
      pages: [{ pageNumber: 1, rawText: '' }],
      pageCount: 1,
      fullText: '',
    };
  }

  const pages = splitIntoPages(rawText, pageCount);

  return {
    pages,
    pageCount: pages.length || pageCount,
    fullText: rawText,
  };
}

function splitIntoPages(fullText, pageCount) {
  if (!fullText || fullText.trim() === '') {
    return [{ pageNumber: 1, rawText: '' }];
  }

  // Try splitting by form feed character first
  let pages = fullText.split('\f');

  if (pages.length === 1 && pageCount > 1) {
    // Fallback: split by approximate equal chunks
    const avgLen = Math.ceil(fullText.length / pageCount);
    pages = [];
    for (let i = 0; i < pageCount; i++) {
      const start = i * avgLen;
      const end = Math.min(start + avgLen, fullText.length);
      let splitEnd = end;
      if (i < pageCount - 1) {
        const nextNewline = fullText.indexOf('\n', end - 50);
        if (nextNewline > 0 && nextNewline < end + 100) {
          splitEnd = nextNewline + 1;
        }
      }
      pages.push(fullText.slice(start, splitEnd));
    }
  }

  // Clean up empty trailing pages
  while (pages.length > 0 && pages[pages.length - 1].trim() === '') {
    pages.pop();
  }

  if (pages.length === 0) {
    pages = [fullText];
  }

  return pages.map((text, index) => ({
    pageNumber: index + 1,
    rawText: text.trim(),
  }));
}

module.exports = { extractTextFromPdf, extractPagesFromPdf };
