(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { disposeCanvas } = PdfConverter.Utils;

  PdfConverter.PdfRenderer = {
    async renderPage(page, scale) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return { canvas, ctx, viewport, width: canvas.width, height: canvas.height };
    },

    cropRegion(sourceCanvas, y0, y1) {
      const top = Math.max(0, Math.floor(y0));
      const bottom = Math.min(sourceCanvas.height, Math.ceil(y1));
      const height = bottom - top;
      if (height < 20) return null;
      const crop = document.createElement('canvas');
      crop.width = sourceCanvas.width;
      crop.height = height;
      crop.getContext('2d').drawImage(sourceCanvas, 0, top, sourceCanvas.width, height, 0, 0, sourceCanvas.width, height);
      return { canvas: crop, top, bottom, height, width: crop.width };
    },

    canvasToPngBlob(canvas) {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не удалось создать изображение фрагмента.'))), 'image/png');
      });
    },

    release(renderResult) {
      if (renderResult?.canvas) disposeCanvas(renderResult.canvas);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
