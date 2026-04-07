const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/im;
const MAX_PAGES_PER_CHUNK = 40;

function chunkScript(pages) {
  if (pages.length <= 80) {
    // Single chunk for short scripts
    return [buildChunk(pages)];
  }

  const chunks = [];
  let currentChunk = [];

  for (const page of pages) {
    currentChunk.push(page);

    if (currentChunk.length >= MAX_PAGES_PER_CHUNK) {
      // Try to split at a scene boundary
      const splitIdx = findLastSceneBoundary(currentChunk);
      if (splitIdx > 0 && splitIdx < currentChunk.length - 5) {
        chunks.push(buildChunk(currentChunk.slice(0, splitIdx)));
        currentChunk = currentChunk.slice(splitIdx);
      } else {
        chunks.push(buildChunk(currentChunk));
        currentChunk = [];
      }
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(buildChunk(currentChunk));
  }

  return chunks;
}

function findLastSceneBoundary(pages) {
  for (let i = pages.length - 1; i > 0; i--) {
    if (SCENE_HEADING_RE.test(pages[i].rawText)) {
      return i;
    }
  }
  return -1;
}

function buildChunk(pages) {
  const text = pages.map(p => `[PAGE ${p.pageNumber}]\n${p.rawText}`).join('\n\n');
  return {
    text,
    pageStart: pages[0].pageNumber,
    pageEnd: pages[pages.length - 1].pageNumber,
    pageCount: pages.length,
  };
}

module.exports = { chunkScript };
