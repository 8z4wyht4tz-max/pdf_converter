(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};

  PdfConverter.PdfLoader = {
  async loadFile(file) {
      if (!file) throw new Error('Файл не выбран.');
      const name = file.name || '';
      if (!/\.pdf$/i.test(name) && file.type && file.type !== 'application/pdf') {
        throw new Error(`«${name}» не является PDF-файлом.`);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length) throw new Error(`Файл «${name}» пуст.`);
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      return { file, doc, bytes };
    },

    async loadFiles(files) {
      const docs = [];
      let totalPages = 0;
      for (const file of files) {
        const loaded = await PdfConverter.PdfLoader.loadFile(file);
        docs.push(loaded);
        totalPages += loaded.doc.numPages;
      }
      return { docs, totalPages };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
