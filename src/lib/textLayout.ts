const MIN_NODE_WIDTH = 112;
const MAX_NODE_WIDTH = 340;
const MIN_NODE_HEIGHT = 42;
const MAX_NODE_HEIGHT = 240;
const HORIZONTAL_PADDING = 36;
const LATIN_CHAR_WIDTH = 7.8;
const CJK_CHAR_WIDTH = 14;
const MAX_SINGLE_LINE_WIDTH = 260;

function isCjk(text: string) {
  return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
}

function getTextUnits(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function estimateTextWidth(text: string) {
  const chars = Array.from(text);
  return chars.reduce((width, char) => {
    if (/\s/.test(char)) return width + 4;
    return width + (isCjk(char) ? CJK_CHAR_WIDTH : LATIN_CHAR_WIDTH);
  }, 0);
}

function getLongestPhraseWidth(text: string) {
  const phrases = isCjk(text)
    ? text
        .split(/[，。！？；：、,.!?;:()[\]{}]+/)
        .filter(Boolean)
    : getTextUnits(text);

  return Math.max(0, ...phrases.map(estimateTextWidth));
}

export function getAutoNodeWidth(text: string) {
  const cleanText = text.trim();
  if (!cleanText) return MIN_NODE_WIDTH;

  const explicitLines = cleanText.split("\n");
  const longestLineWidth = Math.max(...explicitLines.map(estimateTextWidth));
  const totalWidth = estimateTextWidth(cleanText.replace(/\s*\n\s*/g, " "));

  if (explicitLines.length > 1) {
    return Math.min(
      MAX_NODE_WIDTH,
      Math.max(MIN_NODE_WIDTH, longestLineWidth + HORIZONTAL_PADDING),
    );
  }

  if (totalWidth <= MAX_SINGLE_LINE_WIDTH) {
    return Math.min(
      MAX_SINGLE_LINE_WIDTH + HORIZONTAL_PADDING,
      Math.max(MIN_NODE_WIDTH, totalWidth + HORIZONTAL_PADDING),
    );
  }

  const targetLines = totalWidth > 560 ? 3 : 2;
  const balancedLineWidth = totalWidth / targetLines;
  const phraseWidth = getLongestPhraseWidth(cleanText);

  return Math.min(
    MAX_NODE_WIDTH,
    Math.max(MIN_NODE_WIDTH, balancedLineWidth + HORIZONTAL_PADDING, phraseWidth),
  );
}

export function clampNodeWidth(width: number) {
  return Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, width));
}

export function clampNodeHeight(height: number) {
  return Math.min(MAX_NODE_HEIGHT, Math.max(MIN_NODE_HEIGHT, height));
}
