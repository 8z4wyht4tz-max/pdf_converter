(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { Utils, TableMerger } = PdfConverter;

  PdfConverter.ExcelBuilder = {
    build(sections) {
      const wb = XLSX.utils.book_new();
      const summary = [['№', 'Файл', 'Раздел', 'Стартовая страница', 'Конечная страница', 'Стоп найден', 'Совпадение начала, %', 'Таблиц', 'Предупреждения']];
      const ocrLog = [['Файл', 'Раздел', 'Страница', 'OCR-текст']];
      const phraseLog = [['Файл', 'Раздел', 'Тип', 'Страница', 'Фраза', 'Совпадение %', 'Распознано']];

      sections.forEach((s, si) => {
        const activeTables = (s.tables || []).filter((t) => !t.excluded);
        summary.push([
          si + 1, s.fileName, s.title, s.startPage, s.endPage,
          s.stopFound ? 'Да' : 'Нет',
          Math.round((s.startScore || 0) * 100),
          activeTables.length,
          (s.warnings || []).join('; ')
        ]);
        (s.ocrText || []).forEach((t) => ocrLog.push([s.fileName, s.title, t.page, t.text]));
        (s.phraseLog || []).forEach((p) => phraseLog.push([
          s.fileName, s.title, p.type === 'start' ? 'Начало' : 'Стоп',
          p.page, p.phrase, Math.round((p.score || 0) * 100), p.text
        ]));
      });

      const wsSummary = XLSX.utils.aoa_to_sheet(summary);
      PdfConverter.ExcelBuilder._setCols(wsSummary, [6, 32, 48, 18, 18, 14, 22, 10, 55]);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Сводка');

      let globalTable = 0;
      sections.forEach((s, si) => {
        const activeTables = (s.tables || []).filter((t) => !t.excluded);
        if (!activeTables.length) {
          const rows = [
            [s.title],
            [`Файл: ${s.fileName}`],
            [`Страницы: ${s.startPage}–${s.endPage}`],
            [],
            ['OCR-текст']
          ];
          (s.ocrText || []).forEach((t) => {
            rows.push([`Страница ${t.page}`]);
            rows.push([t.text]);
            rows.push([]);
          });
          const ws = XLSX.utils.aoa_to_sheet(rows);
          PdfConverter.ExcelBuilder._setCols(ws, [120]);
          XLSX.utils.book_append_sheet(wb, ws, PdfConverter.ExcelBuilder._uniqueSheetName(wb, `Раздел_${si + 1}`));
        }
        activeTables.forEach((t) => {
          globalTable++;
          const pageLabel = t.pages ? t.pages.join('–') : String(t.page);
          const rows = [
            [s.title],
            [`Файл: ${s.fileName}`],
            [`Страница: ${pageLabel}`],
            [`Качество структуры: ${Math.round((t.confidence || 0) * 100)}%${t.fallback ? ' — резервный режим' : ''}${t.merged ? ' — объединено' : ''}`],
            [],
            ...t.matrix
          ];
          const ws = XLSX.utils.aoa_to_sheet(rows);
          PdfConverter.ExcelBuilder._setCols(ws, PdfConverter.ExcelBuilder._autoColWidths(rows));
          XLSX.utils.book_append_sheet(wb, ws, PdfConverter.ExcelBuilder._uniqueSheetName(wb, `Т${globalTable}_стр${pageLabel}`));
        });
      });

      const wsOcr = XLSX.utils.aoa_to_sheet(ocrLog);
      PdfConverter.ExcelBuilder._setCols(wsOcr, [32, 48, 10, 120]);
      XLSX.utils.book_append_sheet(wb, wsOcr, 'OCR_журнал');

      const wsPhrases = XLSX.utils.aoa_to_sheet(phraseLog);
      PdfConverter.ExcelBuilder._setCols(wsPhrases, [32, 48, 12, 10, 40, 14, 60]);
      XLSX.utils.book_append_sheet(wb, wsPhrases, 'Журнал_фраз');

      return wb;
    },

    download(wb, filename) {
      XLSX.writeFile(wb, filename, { compression: true });
    },

    async downloadZip(wb, filename, images, metrics) {
      const zip = new JSZip();
      const xlsx = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
      zip.file(`${filename}.xlsx`, xlsx);
      const folder = zip.folder('Фрагменты_скана');
      for (const img of images) {
        const data = img.blob ? await img.blob.arrayBuffer() : null;
        if (data) folder.file(img.name, data);
      }
      zip.file('README.txt',
        `PDF-конвертер таблиц\n\nExcel: таблицы, сводка, OCR-журнал, журнал фраз.\nФрагменты скана — в папке «Фрагменты_скана».\n\nРазделов: ${metrics.sections}\nТаблиц: ${metrics.tables}\n`
      );
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      Utils.saveBlob(blob, `${filename}_с_фрагментами.zip`);
    },

    _autoColWidths(rows) {
      const max = Math.max(1, ...rows.map((r) => r.length));
      return Array.from({ length: max }, (_, c) => Math.min(55, Math.max(12, ...rows.map((r) => String(r[c] ?? '').length + 2))));
    },

    _setCols(ws, widths) {
      ws['!cols'] = widths.map((w) => ({ wch: w }));
    },

    _uniqueSheetName(wb, name) {
      let base = Utils.sanitizeSheet(name).slice(0, 31) || 'Лист';
      let n = base;
      let i = 2;
      while (wb.SheetNames.includes(n)) {
        const suf = `_${i++}`;
        n = base.slice(0, 31 - suf.length) + suf;
      }
      return n;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
