(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const {
    Utils, PdfRenderer, TableDetector, TableMerger, PhraseMatcher, TableBuilder, SectionStateMachine
  } = PdfConverter;
  const { disposeCanvas, rowsToText, sanitizeName, revokeObjectUrl } = Utils;

  PdfConverter.SectionDetector = {
    async processDocument(file, doc, ctx) {
      const {
        ocr, starts, stop, threshold, scale, preprocess, signal,
        onPage, onPhrase, onSection, onResumeSearch, metrics
      } = ctx;

      const sections = [];
      const images = [];
      let active = null;
      let sectionCounter = 0;
      let searchFromY = 0;

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        if (signal.aborted) break;

        const page = await doc.getPage(pageNum);
        let renderResult = null;
        let ocrCanvas = null;

        try {
          renderResult = await PdfRenderer.renderPage(page, scale);
          ocrCanvas = preprocess.enabled
            ? PdfConverter.ImagePreprocessor.enhance(PdfConverter.ImagePreprocessor.copyCanvas(renderResult.canvas), preprocess)
            : renderResult.canvas;

          const ocrResult = await ocr.recognize(ocrCanvas, signal);
          const words = ocrResult.words;
          metrics.pages++;
          onPage({ fileName: file.name, pageNum, totalPages: doc.numPages, phase: 'done' });

          if (!active) searchFromY = 0;

          const startHits = [];
          for (const phrase of starts) {
            for (const hit of PhraseMatcher.findPhraseMatches(words, phrase, threshold, 5)) {
              startHits.push({ ...hit, kind: 'start', phrase });
            }
          }

          let stopHits = PhraseMatcher.findPhraseMatches(words, stop, Math.max(0.60, threshold - 0.08), 10)
            .map((h) => ({ ...h, kind: 'stop', phrase: stop }));
          stopHits = PhraseMatcher.filterStopHits(stopHits, words, renderResult.width);

          startHits.forEach((h) => onPhrase(pageNum, 'start', h));
          stopHits.forEach((h) => onPhrase(pageNum, 'stop', h));

          const events = [...startHits, ...stopHits].sort((a, b) => a.y0 - b.y0 || (a.kind === 'stop' ? 1 : -1));
          let cursorY = active ? 0 : null;

          for (const event of events) {
            if (!active && event.kind === 'start') {
              if (event.y0 < searchFromY - 5) continue;
              sectionCounter++;
              active = {
                id: `${sanitizeName(file.name.replace(/\.pdf$/i, ''))}_${sectionCounter}`,
                fileName: file.name,
                title: event.phrase,
                recognizedTitle: event.recognized,
                startPage: pageNum,
                endPage: pageNum,
                startScore: event.score,
                stopFound: false,
                segments: [],
                tables: [],
                ocrText: [],
                rawOcr: [],
                warnings: [],
                phraseLog: []
              };
              active.phraseLog.push({ type: 'start', page: pageNum, phrase: event.phrase, score: event.score, text: event.recognized });
              cursorY = Math.min(renderResult.height, event.y1 + Math.max(8, renderResult.height * 0.004));
              continue;
            }
            if (active && event.kind === 'stop' && event.y0 >= (cursorY ?? 0)) {
              if (event.y0 > (cursorY ?? 0) + 15) {
                await PdfConverter.SectionDetector._addSegment(active, renderResult.canvas, words, pageNum, cursorY ?? 0, event.y0, images);
              }
              active.endPage = pageNum;
              active.stopFound = true;
              active.stopScore = event.score;
              active.phraseLog.push({ type: 'stop', page: pageNum, phrase: stop, score: event.score, text: event.recognized });
              PdfConverter.SectionDetector._finalizeSection(active, sections, onSection, metrics);
              active = null;
              cursorY = null;
              searchFromY = event.y1 + Math.max(8, renderResult.height * 0.004);
              if (onResumeSearch) {
                onResumeSearch({
                  pageNum,
                  searchFromY,
                  message: `Повторный поиск ключевых фраз ниже стоп-фразы (стр. ${pageNum}, Y ≥ ${Math.round(searchFromY)})`
                });
              }
            }
          }

          if (active) {
            const fromY = cursorY ?? 0;
            if (renderResult.height > fromY + 15) {
              await PdfConverter.SectionDetector._addSegment(active, renderResult.canvas, words, pageNum, fromY, renderResult.height, images);
            }
            active.endPage = pageNum;
          }
        } catch (err) {
          if (err.name === 'AbortError') break;
          throw new Error(`Страница ${pageNum} (${file.name}): ${err.message || err}`);
        } finally {
          if (ocrCanvas && ocrCanvas !== renderResult?.canvas) disposeCanvas(ocrCanvas);
          PdfRenderer.release(renderResult);
        }
      }

      if (active) {
        active.warnings.push('Стоп-фраза не найдена: раздел завершён на последней странице PDF.');
        PdfConverter.SectionDetector._finalizeSection(active, sections, onSection, metrics);
      }

      return { sections, images };
    },

    async _addSegment(section, pageCanvas, pageWords, pageNum, y0, y1, images) {
      const crop = PdfRenderer.cropRegion(pageCanvas, y0, y1);
      if (!crop) return;

      const blob = await PdfRenderer.canvasToPngBlob(crop.canvas);
      const previewUrl = URL.createObjectURL(blob);
      const imageName = `${section.id}_стр_${pageNum}_${section.segments.length + 1}.png`;

      images.push({ name: imageName, blob, previewUrl });

      const words = pageWords
        .filter((w) => Utils.centerY(w) >= crop.top && Utils.centerY(w) < crop.bottom)
        .map((w) => ({ ...w, y0: w.y0 - crop.top, y1: w.y1 - crop.top }));

      const tables = TableDetector.extractTables(words, crop.canvas, pageNum);
      const text = rowsToText(TableBuilder.groupRows(words));

      section.ocrText.push({ page: pageNum, text });
      section.rawOcr.push({ page: pageNum, text, words: words.map((w) => ({ ...w })) });
      section.segments.push({
        page: pageNum,
        imageName,
        previewUrl,
        y0: crop.top,
        y1: crop.bottom,
        tablesCount: tables.length
      });
      section.tables.push(...tables.map((t) => ({ ...t, sectionId: section.id, previewUrl })));

      disposeCanvas(crop.canvas);
    },

    _finalizeSection(section, sections, onSection, metrics) {
      section.tables = TableMerger.mergeSectionTables(section);
      if (!TableMerger.countActiveTables(section.tables)) {
        section.warnings.push('Табличная структура не распознана; сохранён OCR-текст и изображение фрагмента.');
      }
      sections.push(section);
      metrics.sections++;
      metrics.tables += TableMerger.countActiveTables(section.tables);
      onSection(section);
    },

    releaseImages(images) {
      (images || []).forEach((img) => revokeObjectUrl(img.previewUrl));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
