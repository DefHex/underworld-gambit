import type { Rect } from './coords';

/**
 * Screen rectangles (css px) for the Overworld and Underworld in top view:
 * side by side on wide screens, stacked on tall ones.
 */
export function dualBoardRects(screenWidth: number, screenHeight: number): [Rect, Rect] {
  if (screenWidth >= screenHeight) {
    const left = 58, right = 8, top = 30, bottom = 8, gap = 8;
    const boardWidth = (screenWidth - left - right - gap) / 2;
    const boardHeight = screenHeight - top - bottom;
    return [
      { x: left, y: top, w: boardWidth, h: boardHeight },
      { x: left + boardWidth + gap, y: top, w: boardWidth, h: boardHeight },
    ];
  }
  const side = 6, top = 34, bottom = 112, gap = 8;
  const boardWidth = screenWidth - side * 2;
  const boardHeight = (screenHeight - top - bottom - gap) / 2;
  return [
    { x: side, y: top, w: boardWidth, h: boardHeight },
    { x: side, y: top + boardHeight + gap, w: boardWidth, h: boardHeight },
  ];
}

/** The small corner window that previews the other board. In portrait it sits above the toolbar. */
export function portalRectFor(screenWidth: number, screenHeight: number): Rect {
  const w = Math.min(230, Math.round(screenWidth * 0.27));
  const h = Math.round(w * 0.58);
  const isPortrait = screenHeight > screenWidth;
  return { x: screenWidth - w - 14, y: screenHeight - h - (isPortrait ? 118 : 14), w, h };
}
