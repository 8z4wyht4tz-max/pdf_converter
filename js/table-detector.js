(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { Utils, TableBuilder } = PdfConverter;
  const { median, trimMatrix } = Utils;

  PdfConverter.TableDetector = {
    detectLineGrid(canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const { width, height } = canvas;
      if (width < 20 || height < 20) return { hLines: [], vLines: [] };
      const step = Math.max(1, Math.floor(Math.min(width, height) / 400));
      const data = ctx.getImageData(0, 0, width, height).data;
      const isDark = (x, y) => {
        const i = (y * width + x) * 4;
        const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        return g < 140;
      };

      const hLines = [];
      for (let y = 0; y < height; y += step) {
        let dark = 0;
        let total = 0;
        for (let x = 0; x < width; x += step) { total++; if (isDark(x, y)) dark++; }
        if (total && dark / total > 0.55) hLines.push(y);
      }
      const vLines = [];
      for (let x = 0; x < width; x += step) {
        let dark = 0;
        let total = 0;
        for (let y = 0; y < height; y += step) { total++; if (isDark(x, y)) dark++; }
        if (total && dark / total > 0.55) vLines.push(x);
      }
      return {
        hLines: PdfConverter.TableDetector._clusterLines(hLines, 6),
        vLines: PdfConverter.TableDetector._clusterLines(vLines, 6)
      };
    },

    _clusterLines(lines, tol) {
      if (!lines.length) return [];
      const sorted = [...lines].sort((a, b) => a - b);
      const out = [];
      let cluster = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] <= tol) cluster.push(sorted[i]);
        else {
          out.push(Math.round(cluster.reduce((a, b) => a + b, 0) / cluster.length));
          cluster = [sorted[i]];
        }
      }
      out.push(Math.round(cluster.reduce((a, b) => a + b, 0) / cluster.length));
      return out;
    },

    extractTables(words, canvas, pageNum) {
      const width = canvas.width;
      const height = canvas.height;
      const rows = TableBuilder.groupRows(words);
      if (!rows.length) return [];

      const grid = PdfConverter.TableDetector.detectLineGrid(canvas);
      const lineAnchors = grid.vLines.length >= 2 ? grid.vLines : null;

      const rowHeights = rows.map((r) => Math.max(...r.map((w) => w.y1)) - Math.min(...r.map((w) => w.y0))).filter((x) => x > 0);
      const medH = median(rowHeights) || 18;
      const groups = [];
      let current = [];
      let prevBottom = null;
      for (const row of rows) {
        const top = Math.min(...row.map((w) => w.y0));
        const bottom = Math.max(...row.map((w) => w.y1));
        if (prevBottom !== null && top - prevBottom > medH * 2.6 && current.length) {
          groups.push(current);
          current = [];
        }
        current.push(row);
        prevBottom = bottom;
      }
      if (current.length) groups.push(current);

      const tables = [];
      let tableIndex = 0;
      for (const group of groups) {
        const structured = TableBuilder.rowsToMatrix(group, width, lineAnchors);
        const nonEmpty = structured.matrix.filter((r) => r.some((v) => String(v || '').trim()));
        const maxCols = Math.max(0, ...nonEmpty.map((r) => r.length));
        const multiCellRows = nonEmpty.filter((r) => r.filter((v) => String(v || '').trim()).length >= 2).length;
        if (nonEmpty.length >= 2 && maxCols >= 2 && multiCellRows >= Math.min(2, nonEmpty.length)) {
          tableIndex++;
          tables.push({
            id: `p${pageNum}_t${tableIndex}`,
            page: pageNum,
            matrix: trimMatrix(nonEmpty),
            anchors: structured.anchors,
            confidence: structured.confidence,
            excluded: false,
            hasLines: !!(lineAnchors && lineAnchors.length >= 2)
          });
        }
      }
      if (!tables.length && rows.length >= 2) {
        const structured = TableBuilder.rowsToMatrix(rows, width, lineAnchors);
        tables.push({
          id: `p${pageNum}_t1`,
          page: pageNum,
          matrix: trimMatrix(structured.matrix),
          anchors: structured.anchors,
          confidence: Math.min(structured.confidence, 0.45),
          excluded: false,
          fallback: true,
          hasLines: !!(lineAnchors && lineAnchors.length >= 2)
        });
      }
      return tables;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
