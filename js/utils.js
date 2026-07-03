/* eslint-disable no-unused-vars */
(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};

  PdfConverter.Utils = {
    median(arr) {
      if (!arr.length) return 0;
      const a = [...arr].sort((x, y) => x - y);
      const m = Math.floor(a.length / 2);
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    },

    levenshtein(a, b) {
      const m = a.length;
      const n = b.length;
      let prev = Array(n + 1).fill(0).map((_, i) => i);
      let cur = Array(n + 1);
      for (let i = 1; i <= m; i++) {
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
          cur[j] = Math.min(
            cur[j - 1] + 1,
            prev[j] + 1,
            prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
          );
        }
        [prev, cur] = [cur, prev];
      }
      return prev[n];
    },

    similarity(a, b) {
      if (a === b) return 1;
      const d = PdfConverter.Utils.levenshtein(a, b);
      return 1 - d / Math.max(a.length, b.length, 1);
    },

    rangesOverlap(a0, a1, b0, b1) {
      return Math.max(a0, b0) <= Math.min(a1, b1);
    },

    centerY(w) {
      return (w.y0 + w.y1) / 2;
    },

    centerX(w) {
      return (w.x0 + w.x1) / 2;
    },

    clusterNumbers(nums, tol) {
      const a = [...nums].filter(Number.isFinite).sort((x, y) => x - y);
      const clusters = [];
      for (const n of a) {
        const last = clusters[clusters.length - 1];
        if (!last || Math.abs(n - last.mean) > tol) {
          clusters.push({ values: [n], mean: n });
        } else {
          last.values.push(n);
          last.mean = last.values.reduce((x, y) => x + y, 0) / last.values.length;
        }
      }
      return clusters.map((c) => c.mean);
    },

    nearestIndex(arr, value) {
      if (!arr.length) return -1;
      let idx = 0;
      let d = Infinity;
      arr.forEach((v, i) => {
        const nd = Math.abs(v - value);
        if (nd < d) { d = nd; idx = i; }
      });
      return idx;
    },

    wordsConfidence(words) {
      const c = words.map((w) => Number(w.conf)).filter(Number.isFinite).filter((v) => v >= 0);
      return c.length ? Math.max(0, Math.min(1, c.reduce((a, b) => a + b, 0) / c.length / 100)) : 0;
    },

    trimMatrix(matrix) {
      let m = matrix.map((r) => r.map((v) => String(v ?? '').trim()));
      while (m.length && !m[0].some(Boolean)) m.shift();
      while (m.length && !m[m.length - 1].some(Boolean)) m.pop();
      let max = Math.max(0, ...m.map((r) => r.length));
      while (max > 0 && m.every((r) => !String(r[max - 1] || '').trim())) max--;
      return m.map((r) => r.slice(0, max));
    },

    rowsToText(rows) {
      return rows.map((r) => r.map((w) => w.text).join(' ')).join('\n');
    },

    escapeHtml(s) {
      return String(s).replace(/[&<>'"]/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[c]));
    },

    sanitizeName(s) {
      return String(s).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'PDF_таблицы';
    },

    sanitizeSheet(s) {
      return String(s).replace(/[\\\/?*[\]:]/g, '_');
    },

    formatBytes(b) {
      if (!b) return '0 Б';
      const u = ['Б', 'КБ', 'МБ', 'ГБ'];
      const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
      return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
    },

    disposeCanvas(canvas) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 1;
      canvas.height = 1;
    },

    revokeObjectUrl(url) {
      if (url && String(url).startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
      }
    },

    saveBlob(blob, name) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    },

    translateOcrStatus(s) {
      return ({
        'loading tesseract core': 'Загрузка OCR-ядра',
        'initializing tesseract': 'Инициализация OCR',
        'loading language traineddata': 'Загрузка языков',
        'initializing api': 'Подготовка языка',
        'recognizing text': 'Распознавание текста'
      }[s] || s);
    },

    userError(err) {
      const msg = err?.message || String(err);
      if (/password|encrypted/i.test(msg)) return 'PDF защищён паролем. Откройте файл без пароля и повторите.';
      if (/Invalid PDF/i.test(msg)) return 'Файл повреждён или не является PDF.';
      if (/network|fetch|Failed to fetch/i.test(msg)) return 'Нет доступа к интернету для загрузки OCR-библиотек. Проверьте соединение.';
      if (/memory|allocation/i.test(msg)) return 'Недостаточно памяти. Уменьшите качество OCR или обрабатывайте файлы по одному.';
      return msg;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
