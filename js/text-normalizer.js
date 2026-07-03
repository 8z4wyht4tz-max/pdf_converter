(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { similarity } = PdfConverter.Utils;

  const LATIN_MAP = { a: 'а', b: 'в', e: 'е', k: 'к', m: 'м', h: 'н', o: 'о', p: 'р', c: 'с', t: 'т', x: 'х', y: 'у' };

  PdfConverter.TextNormalizer = {
    normalizeText(text) {
      return String(text || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[abekmhopctxy]/g, (ch) => LATIN_MAP[ch] || ch)
        .replace(/8/g, 'в')
        .replace(/6/g, 'б')
        .replace(/0/g, 'о')
        .replace(/\|/g, 'і')
        .replace(/[^а-я0-9]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    },

    normalizeWord(text) {
      return PdfConverter.TextNormalizer.normalizeText(text).replace(/\s/g, '');
    },

    dehyphenateWords(words) {
      const out = [];
      for (let i = 0; i < words.length; i++) {
        const w = { ...words[i] };
        const t = w.text || '';
        if (/-$|–$|—$/.test(t) && i + 1 < words.length) {
          const next = words[i + 1];
          const gap = next.x0 - w.x1;
          const sameLine = Math.abs(PdfConverter.Utils.centerY(w) - PdfConverter.Utils.centerY(next)) < Math.max(8, (w.y1 - w.y0) * 0.8);
          if (sameLine && gap < Math.max(40, (w.x1 - w.x0) * 0.5)) {
            w.text = t.replace(/[-–—]+$/, '') + (next.text || '');
            w.x1 = next.x1;
            w.y0 = Math.min(w.y0, next.y0);
            w.y1 = Math.max(w.y1, next.y1);
            i++;
          }
        }
        out.push(w);
      }
      return out;
    },

    buildVirtualLines(words, lineTolerance) {
      const sorted = [...words].filter((w) => w.text?.trim()).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const heights = sorted.map((w) => Math.max(1, w.y1 - w.y0));
      const tol = lineTolerance || Math.max(10, (PdfConverter.Utils.median(heights) || 14) * 0.65);
      const lines = [];
      for (const w of sorted) {
        const cy = PdfConverter.Utils.centerY(w);
        let best = null;
        let bestDist = Infinity;
        for (const line of lines) {
          const d = Math.abs(cy - line.cy);
          if (d < tol && d < bestDist) { best = line; bestDist = d; }
        }
        if (!best) {
          best = { cy, words: [] };
          lines.push(best);
        }
        best.words.push(w);
        best.cy = (best.cy * (best.words.length - 1) + cy) / best.words.length;
      }
      return lines.sort((a, b) => a.cy - b.cy).map((l) => ({
        text: l.words.sort((a, b) => a.x0 - b.x0).map((w) => w.text).join(' '),
        y0: Math.min(...l.words.map((w) => w.y0)),
        y1: Math.max(...l.words.map((w) => w.y1)),
        words: l.words
      }));
    },

    lineSimilarity(lineText, phrase) {
      const a = PdfConverter.TextNormalizer.normalizeText(lineText);
      const b = PdfConverter.TextNormalizer.normalizeText(phrase);
      if (!a || !b) return 0;
      if (a.includes(b) || b.includes(a)) return Math.min(1, b.length / Math.max(a.length, 1) + 0.35);
      return similarity(a, b);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
