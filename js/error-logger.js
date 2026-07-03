(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};

  PdfConverter.ErrorLogger = {
    logs: [],

    reset() {
      this.logs = [];
    },

    log(message, type = '') {
      const line = `[${new Date().toLocaleTimeString('ru-RU')}] ${message}`;
      this.logs.push({ line, type, message });
      return { line, type };
    },

    phraseHit(pageNum, kind, phrase, score, recognized) {
      const label = kind === 'start' ? 'начало' : 'стоп';
      return this.log(
        `Стр. ${pageNum}: ${label} «${phrase}» — ${Math.round(score * 100)}% (${recognized})`,
        kind === 'start' ? 'ok' : 'warning'
      );
    },

    sectionFound(index, section) {
      return this.log(
        `Раздел ${index}: «${section.title}», стр. ${section.startPage}–${section.endPage}, таблиц: ${section.tables.filter((t) => !t.excluded).length}`,
        section.stopFound ? 'ok' : 'warning'
      );
    },

    error(err) {
      const msg = PdfConverter.Utils.userError(err);
      return this.log(`Ошибка: ${msg}`, 'error');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
