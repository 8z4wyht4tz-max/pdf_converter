(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const {
    Utils, PdfLoader, OcrEngine, SectionDetector, ExcelBuilder, ErrorLogger, UiController, TableMerger
  } = PdfConverter;

  PdfConverter.App = {
    state: {
      files: [],
      sections: [],
      images: [],
      workbook: null,
      metrics: { files: 0, pages: 0, sections: 0, tables: 0 },
      outputBase: 'PDF_таблицы',
      abortController: null,
      running: false
    },

    init() {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      UiController.bind(this.state, {
        onFiles: (files) => this.setFiles(files),
        onStart: () => this.run(),
        onCancel: () => this.cancel(),
        onExcel: () => this.downloadExcel(),
        onZip: () => this.downloadZip(),
        onRebuild: () => this.rebuildWorkbook()
      });
    },

    setFiles(files) {
      this.state.files = files;
      UiController.setFiles(files);
      if (files.length) {
        this.state.outputBase = Utils.sanitizeName(
          files.length === 1 ? files[0].name.replace(/\.pdf$/i, '') + '_таблицы' : 'PDF_таблицы_сводно'
        );
      }
    },

    resetRun() {
      SectionDetector.releaseImages(this.state.images);
      this.state.sections = [];
      this.state.images = [];
      this.state.workbook = null;
      this.state.metrics = { files: 0, pages: 0, sections: 0, tables: 0 };
      ErrorLogger.reset();
      UiController.clearLog();
      UiController.updateMetrics(this.state.metrics);
      UiController.setExportEnabled(false);
      UiController.renderPreview(this.state, () => {});
    },

    cancel() {
      if (this.state.abortController) this.state.abortController.abort();
      UiController.appendLog(ErrorLogger.log('Запрошена остановка. Текущая страница будет завершена.', 'warning'));
    },

    toggleTable(tableId, included) {
      for (const section of this.state.sections) {
        const table = (section.tables || []).find((t) => t.id === tableId);
        if (table) {
          table.excluded = !included;
          break;
        }
      }
      UiController.refreshTableCount(this.state);
      UiController.renderPreview(this.state, (id, chk) => this.toggleTable(id, chk));
      this.rebuildWorkbook();
    },

    rebuildWorkbook() {
      if (!this.state.sections.length) return;
      this.state.workbook = ExcelBuilder.build(this.state.sections);
      UiController.setExportEnabled(true);
      UiController.appendLog(ErrorLogger.log('Excel пересобран с учётом выбранных таблиц.', 'ok'));
    },

    async run() {
      if (!this.state.files.length || this.state.running) return;

      const starts = UiController.$('startPhrases').value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const stop = UiController.$('stopPhrase').value.trim();
      const threshold = Math.max(0.55, Math.min(0.95, Number(UiController.$('threshold').value || 72) / 100));
      const scale = Number(UiController.$('scale').value || 2.5);
      const preprocess = {
        enabled: UiController.$('preprocess')?.checked !== false,
        contrast: 1.25,
        binarize: false
      };

      if (!starts.length || !stop) {
        alert('Укажите начальные и стоп-фразу.');
        return;
      }

      this.resetRun();
      this.state.running = true;
      this.state.abortController = new AbortController();
      const signal = this.state.abortController.signal;

      UiController.setBusy(true, this.state.files.length > 0);
      UiController.setProgress(1, 'Загрузка OCR', 'Подготавливаю русский и английский языки…', '—');

      try {
        await OcrEngine.init((m) => {
          if (typeof m.progress === 'number') {
            UiController.setProgress(
              2 + Math.round(m.progress * 3),
              'Загрузка OCR',
              `${Utils.translateOcrStatus(m.status)}: ${Math.round(m.progress * 100)}%`,
              '—'
            );
          }
        });
        UiController.appendLog(ErrorLogger.log('OCR-модуль rus+eng готов.', 'ok'));

        const { docs, totalPages } = await PdfLoader.loadFiles(this.state.files);
        let donePages = 0;

        for (const { file, doc } of docs) {
          if (signal.aborted) break;
          UiController.appendLog(ErrorLogger.log(`Файл: ${file.name} — ${doc.numPages} стр.`));

          const result = await SectionDetector.processDocument(file, doc, {
            ocr: OcrEngine,
            starts,
            stop,
            threshold,
            scale,
            preprocess,
            signal,
            metrics: this.state.metrics,
            onPage: ({ fileName, pageNum, totalPages: tp }) => {
              donePages++;
              UiController.setProgress(
                5 + Math.round((donePages / Math.max(totalPages, 1)) * 88),
                `OCR: ${fileName}`,
                `Страница ${pageNum} из ${tp}`,
                `${fileName} · стр. ${pageNum}/${tp}`
              );
              UiController.updateMetrics(this.state.metrics);
            },
            onPhrase: (pageNum, kind, hit) => {
              const entry = ErrorLogger.phraseHit(pageNum, kind, hit.phrase, hit.score, hit.recognized);
              UiController.appendLog(entry);
            },
            onSection: (section) => {
              this.state.sections.push(section);
              const entry = ErrorLogger.sectionFound(this.state.metrics.sections, section);
              UiController.appendLog(entry);
              UiController.updateMetrics(this.state.metrics);
              UiController.renderPreview(this.state, (id, chk) => this.toggleTable(id, chk));
            }
          });

          this.state.images.push(...result.images);
          this.state.metrics.files++;
          UiController.updateMetrics(this.state.metrics);
        }

        if (signal.aborted) {
          UiController.setProgress(100, 'Остановлено', 'Обработка остановлена. Можно выгрузить частичный результат.', '—');
          UiController.appendLog(ErrorLogger.log('Обработка остановлена пользователем.', 'warning'));
        } else {
          UiController.setProgress(95, 'Формирование Excel', 'Собираю листы и журнал…', '—');
        }

        this.rebuildWorkbook();
        UiController.setProgress(
          100,
          signal.aborted ? 'Частичный результат готов' : 'Готово',
          `Разделов: ${this.state.metrics.sections}; таблиц: ${TableMerger.countActiveTables(this.state.sections.flatMap((s) => s.tables || []))}`,
          '—'
        );

        if (!this.state.metrics.sections) {
          UiController.appendLog(ErrorLogger.log('Начальные фразы не найдены. Снизьте порог до 65–68% или повысьте качество OCR.', 'warning'));
        }
      } catch (err) {
        console.error(err);
        const entry = ErrorLogger.error(err);
        UiController.appendLog(entry);
        UiController.setProgress(100, 'Ошибка', Utils.userError(err), '—');
        alert(`Не удалось обработать PDF.\n\n${Utils.userError(err)}`);
      } finally {
        await OcrEngine.terminate();
        this.state.running = false;
        this.state.abortController = null;
        UiController.setBusy(false, this.state.files.length > 0);
      }
    },

    downloadExcel() {
      if (!this.state.workbook) return;
      ExcelBuilder.download(this.state.workbook, `${this.state.outputBase}.xlsx`);
    },

    async downloadZip() {
      if (!this.state.workbook) return;
      await ExcelBuilder.downloadZip(this.state.workbook, this.state.outputBase, this.state.images, this.state.metrics);
    }
  };

  document.addEventListener('DOMContentLoaded', () => PdfConverter.App.init());
})(typeof window !== 'undefined' ? window : globalThis);
