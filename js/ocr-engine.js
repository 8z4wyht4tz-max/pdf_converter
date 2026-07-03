(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { PhraseMatcher } = PdfConverter;

  PdfConverter.OcrEngine = {
    worker: null,

    async init(onProgress) {
      if (this.worker) return this.worker;
      this.worker = await Tesseract.createWorker(['rus', 'eng'], 1, {
        logger: (m) => {
          if (onProgress && m.status) onProgress(m);
        }
      });
      await this.worker.setParameters({
        preserve_interword_spaces: '1',
        tessedit_pageseg_mode: Tesseract.PSM.AUTO
      });
      return this.worker;
    },

    async recognize(canvas, signal) {
      if (signal?.aborted) throw new DOMException('Обработка отменена.', 'AbortError');
      const rec = await this.worker.recognize(canvas, {}, { text: true, blocks: true, tsv: true });
      if (signal?.aborted) throw new DOMException('Обработка отменена.', 'AbortError');
      const words = PhraseMatcher.getWords(rec.data).filter((w) => w.text && w.conf > -1);
      return {
        words,
        rawText: rec.data.text || '',
        data: rec.data
      };
    },

    async terminate() {
      if (!this.worker) return;
      try { await this.worker.terminate(); } catch (_) { /* ignore */ }
      this.worker = null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
