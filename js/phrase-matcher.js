(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { Utils, TextNormalizer } = PdfConverter;
  const { normalizeText, normalizeWord, dehyphenateWords, buildVirtualLines, lineSimilarity } = TextNormalizer;

  PdfConverter.PhraseMatcher = {
    getWords(data) {
      const words = [];
      if (Array.isArray(data.words) && data.words.length) {
        data.words.forEach((w) => words.push({
          text: w.text || '',
          conf: Number(w.confidence ?? w.conf ?? 0),
          x0: Number(w.bbox?.x0 ?? w.x0 ?? 0),
          y0: Number(w.bbox?.y0 ?? w.y0 ?? 0),
          x1: Number(w.bbox?.x1 ?? w.x1 ?? 0),
          y1: Number(w.bbox?.y1 ?? w.y1 ?? 0)
        }));
      }
      if (!words.length && data.blocks) {
        const walk = (node) => {
          if (!node) return;
          if (node.words) {
            node.words.forEach((w) => words.push({
              text: w.text || '',
              conf: Number(w.confidence ?? w.conf ?? 0),
              x0: Number(w.bbox?.x0 ?? w.x0 ?? 0),
              y0: Number(w.bbox?.y0 ?? w.y0 ?? 0),
              x1: Number(w.bbox?.x1 ?? w.x1 ?? 0),
              y1: Number(w.bbox?.y1 ?? w.y1 ?? 0)
            }));
          }
          if (node.lines) node.lines.forEach(walk);
          if (node.paragraphs) node.paragraphs.forEach(walk);
          if (node.blocks) node.blocks.forEach(walk);
        };
        walk({ blocks: data.blocks });
      }
      if (!words.length && data.tsv) {
        data.tsv.split(/\r?\n/).slice(1).forEach((line) => {
          const c = line.split('\t');
          if (c.length >= 12 && c[0] === '5') {
            words.push({
              text: c.slice(11).join('\t'),
              conf: Number(c[10]),
              x0: Number(c[6]),
              y0: Number(c[7]),
              x1: Number(c[6]) + Number(c[8]),
              y1: Number(c[7]) + Number(c[9])
            });
          }
        });
      }
      return dehyphenateWords(words);
    },

    findPhraseMatches(words, phrase, threshold, maxMatches = 5) {
      const wordHits = PdfConverter.PhraseMatcher._findWordMatches(words, phrase, threshold, maxMatches);
      const lineHits = PdfConverter.PhraseMatcher._findLineMatches(words, phrase, threshold, maxMatches);
      const merged = [...wordHits, ...lineHits];
      merged.sort((a, b) => b.score - a.score);
      const picked = [];
      for (const c of merged) {
        if (picked.some((p) => Utils.rangesOverlap(c.from, c.to, p.from, p.to) || Math.abs(c.y0 - p.y0) < 10)) continue;
        picked.push(c);
        if (picked.length >= maxMatches) break;
      }
      return picked.sort((a, b) => a.y0 - b.y0);
    },

    _findWordMatches(words, phrase, threshold, maxMatches) {
      const prepared = words.map((w, i) => ({ ...w, i, n: normalizeWord(w.text) })).filter((w) => w.n);
      const targetTokens = normalizeText(phrase).split(' ').filter(Boolean);
      const target = targetTokens.join(' ');
      if (!targetTokens.length || !prepared.length) return [];
      const minLen = Math.max(1, targetTokens.length - 2);
      const maxLen = targetTokens.length + 4;
      const candidates = [];
      for (let i = 0; i < prepared.length; i++) {
        for (let len = minLen; len <= maxLen && i + len <= prepared.length; len++) {
          const slice = prepared.slice(i, i + len);
          const candidate = slice.map((x) => x.n).join(' ');
          const score = Utils.similarity(candidate, target);
          if (score >= threshold) {
            candidates.push({
              score,
              from: slice[0].i,
              to: slice[slice.length - 1].i,
              y0: Math.min(...slice.map((x) => x.y0)),
              y1: Math.max(...slice.map((x) => x.y1)),
              x0: Math.min(...slice.map((x) => x.x0)),
              x1: Math.max(...slice.map((x) => x.x1)),
              recognized: slice.map((x) => x.text).join(' ')
            });
          }
        }
      }
      return candidates;
    },

    _findLineMatches(words, phrase, threshold, maxMatches) {
      const lines = buildVirtualLines(words);
      const hits = [];
      const target = normalizeText(phrase);
      for (let i = 0; i < lines.length; i++) {
        let combined = lines[i].text;
        let y0 = lines[i].y0;
        let y1 = lines[i].y1;
        let wordFrom = words.indexOf(lines[i].words[0]);
        let wordTo = words.indexOf(lines[i].words[lines[i].words.length - 1]);
        for (let span = 0; span < 3 && i + span < lines.length; span++) {
          if (span > 0) {
            combined += ' ' + lines[i + span].text;
            y1 = lines[i + span].y1;
            wordTo = words.indexOf(lines[i + span].words[lines[i + span].words.length - 1]);
          }
          const score = lineSimilarity(combined, phrase);
          const norm = normalizeText(combined);
          if (score >= threshold || (norm.includes(target) && target.length >= 6)) {
            hits.push({
              score: Math.max(score, Utils.similarity(norm, target)),
              from: wordFrom >= 0 ? wordFrom : 0,
              to: wordTo >= 0 ? wordTo : wordFrom,
              y0, y1,
              x0: Math.min(...lines[i].words.map((w) => w.x0)),
              x1: Math.max(...lines[i + span].words.map((w) => w.x1)),
              recognized: combined
            });
          }
        }
      }
      return hits.slice(0, maxMatches);
    },

    filterStopHits(stopHits, words, width) {
      const rows = PdfConverter.TableBuilder.groupRows(words);
      return stopHits.filter((hit) => !PdfConverter.PhraseMatcher._isInsideTableRow(hit, rows, width));
    },

    _isInsideTableRow(hit, rows, width) {
      const row = rows.find((r) => {
        const top = Math.min(...r.map((w) => w.y0));
        const bottom = Math.max(...r.map((w) => w.y1));
        const cy = (hit.y0 + hit.y1) / 2;
        return cy >= top - 2 && cy <= bottom + 2;
      });
      if (!row) return false;
      const cells = PdfConverter.TableBuilder.rowToCells(row, width);
      const filled = cells.filter((c) => String(c.text || '').trim()).length;
      if (filled >= 3) return true;
      const rowText = row.map((w) => w.text).join(' ');
      const norm = normalizeText(rowText);
      if (/^в\s+штат\b/.test(norm) && filled <= 2 && row.length <= 4) return false;
      return filled >= 2 && row.length >= 4;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
