(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};

  PdfConverter.ImagePreprocessor = {
    enhance(canvas, options = {}) {
      if (!options.enabled) return canvas;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const { width, height } = canvas;
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const contrast = options.contrast ?? 1.25;
      const brightness = options.brightness ?? 8;

      for (let i = 0; i < data.length; i += 4) {
        let g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        g = (g - 128) * contrast + 128 + brightness;
        g = Math.max(0, Math.min(255, g));
        if (options.binarize) g = g < (options.threshold ?? 165) ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = g;
      }
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    },

    copyCanvas(source) {
      const c = document.createElement('canvas');
      c.width = source.width;
      c.height = source.height;
      c.getContext('2d').drawImage(source, 0, 0);
      return c;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
