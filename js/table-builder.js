(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { Utils } = PdfConverter;
  const { median, centerY, clusterNumbers, nearestIndex, wordsConfidence, trimMatrix } = Utils;

  PdfConverter.TableBuilder = {
    groupRows(words) {
      const sorted = [...words].filter((w) => w.text.trim()).sort((a, b) => centerY(a) - centerY(b) || a.x0 - b.x0);
      const heights = sorted.map((w) => Math.max(1, w.y1 - w.y0));
      const tolerance = Math.max(7, (median(heights) || 14) * 0.55);
      const rows = [];
      for (const word of sorted) {
        const cy = centerY(word);
        let best = null;
        let bestDist = Infinity;
        for (const row of rows) {
          const d = Math.abs(cy - row.cy);
          if (d < tolerance && d < bestDist) { best = row; bestDist = d; }
        }
        if (!best) { best = { cy, words: [] }; rows.push(best); }
        best.words.push(word);
        best.cy = (best.cy * (best.words.length - 1) + cy) / best.words.length;
      }
      return rows.sort((a, b) => a.cy - b.cy).map((r) => r.words.sort((a, b) => a.x0 - b.x0));
    },

    rowToCells(row, width) {
      const charWidths = row.map((w) => (w.x1 - w.x0) / Math.max(1, w.text.length)).filter(Number.isFinite);
      const baseChar = median(charWidths) || 8;
      const cells = [];
      let cell = null;
      for (const w of row) {
        const gap = cell ? w.x0 - cell.x1 : Infinity;
        const splitGap = Math.max(baseChar * 2.6, width * 0.018);
        if (!cell || gap > splitGap) {
          cell = { x0: w.x0, x1: w.x1, text: w.text };
          cells.push(cell);
        } else {
          cell.text += ' ' + w.text;
          cell.x1 = w.x1;
        }
      }
      return cells;
    },

    rowsToMatrix(rows, width, lineAnchors) {
      const cellsByRow = [];
      const starts = [];
      const widths = [];
      for (const row of rows) {
        const cells = PdfConverter.TableBuilder.rowToCells(row, width);
        cellsByRow.push(cells);
        cells.forEach((c) => { starts.push(c.x0); widths.push(c.x1 - c.x0); });
      }
      const anchorTolerance = Math.max(18, (median(widths) || 60) * 0.28, width * 0.012);
      const anchors = lineAnchors?.length
        ? lineAnchors
        : clusterNumbers(starts, anchorTolerance).sort((a, b) => a - b);
      const colCount = Math.max(anchors.length, 1);
      const matrix = cellsByRow.map((cells) => {
        const row = Array(colCount).fill('');
        for (const c of cells) {
          let idx = nearestIndex(anchors, c.x0);
          if (idx < 0) idx = 0;
          row[idx] = row[idx] ? `${row[idx]} ${c.text}` : c.text;
        }
        return row;
      });
      return { matrix, anchors, confidence: wordsConfidence(rows.flat()) };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
