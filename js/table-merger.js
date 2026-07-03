(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { Utils } = PdfConverter;
  const { similarity } = Utils;

  PdfConverter.TableMerger = {
    mergeSectionTables(section) {
      if (!section.tables || section.tables.length < 2) return section.tables || [];
      const active = section.tables.filter((t) => !t.excluded);
      if (active.length < 2) return section.tables;

      const merged = [];
      let buffer = null;

      const flush = () => {
        if (buffer) merged.push(buffer);
        buffer = null;
      };

      for (const table of active) {
        if (!buffer) {
          buffer = { ...table, pages: [table.page], matrix: table.matrix.map((r) => [...r]) };
          continue;
        }
        if (PdfConverter.TableMerger._canMerge(buffer, table)) {
          const rows = PdfConverter.TableMerger._mergeMatrices(buffer.matrix, table.matrix);
          buffer.matrix = rows;
          buffer.pages.push(table.page);
          buffer.page = `${buffer.pages[0]}–${table.page}`;
          buffer.confidence = (buffer.confidence + table.confidence) / 2;
          buffer.merged = true;
        } else {
          flush();
          buffer = { ...table, pages: [table.page], matrix: table.matrix.map((r) => [...r]) };
        }
      }
      flush();

      const excluded = section.tables.filter((t) => t.excluded);
      const result = [...merged, ...excluded];
      let idx = 0;
      return result.map((t) => {
        if (t.excluded) return t;
        idx++;
        return { ...t, id: `${section.id}_tbl_${idx}` };
      });
    },

    _lastPage(table) {
      if (table.pages?.length) return table.pages[table.pages.length - 1];
      if (typeof table.page === 'number') return table.page;
      return parseInt(String(table.page).split('–').pop(), 10);
    },

    _canMerge(a, b) {
      if (typeof b.page !== 'number') return false;
      if (b.page !== PdfConverter.TableMerger._lastPage(a) + 1) return false;
      const colsA = a.anchors?.length || (a.matrix[0]?.length || 0);
      const colsB = b.anchors?.length || (b.matrix[0]?.length || 0);
      if (!colsA || !colsB) return false;
      if (Math.abs(colsA - colsB) > 1) return false;
      const headerA = (a.matrix[0] || []).map((c) => String(c).toLowerCase().trim());
      const headerB = (b.matrix[0] || []).map((c) => String(c).toLowerCase().trim());
      if (headerA.length && headerB.length) {
        const sim = headerA.map((h, i) => similarity(h, headerB[i] || '')).filter((_, i) => headerA[i] && headerB[i]);
        const avg = sim.length ? sim.reduce((x, y) => x + y, 0) / sim.length : 0;
        if (avg > 0.82) return true;
      }
      return colsA === colsB;
    },

    _mergeMatrices(matrixA, matrixB) {
      const headerA = (matrixA[0] || []).join('|').toLowerCase();
      const headerB = (matrixB[0] || []).join('|').toLowerCase();
      const skipHeader = similarity(headerA, headerB) > 0.8;
      const tail = skipHeader ? matrixB.slice(1) : matrixB;
      return [...matrixA, ...tail];
    },

    countActiveTables(tables) {
      return (tables || []).filter((t) => !t.excluded).length;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
