(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};
  const { TableMerger } = PdfConverter;

  PdfConverter.UiController = {
    $(id) {
      return document.getElementById(id);
    },

    bind(state, handlers) {
      const dropZone = this.$('dropZone');
      const fileInput = this.$('fileInput');

      const handleFiles = (files) => {
        const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        if (!pdfs.length && files.length) {
          alert('Выберите файл в формате PDF.');
          return;
        }
        handlers.onFiles(pdfs);
      };

      fileInput.addEventListener('change', () => {
        handleFiles([...fileInput.files]);
        fileInput.value = '';
      });

      dropZone.addEventListener('click', (e) => {
        if (e.target.closest('input, button, a')) return;
        fileInput.click();
      });

      ['dragenter', 'dragover'].forEach((evt) => dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('drag');
      }));
      ['dragleave', 'drop'].forEach((evt) => dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag');
      }));
      dropZone.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));

      this.$('startBtn').addEventListener('click', handlers.onStart);
      this.$('cancelBtn').addEventListener('click', handlers.onCancel);
      this.$('excelBtn').addEventListener('click', handlers.onExcel);
      this.$('zipBtn').addEventListener('click', handlers.onZip);
      this.$('rebuildBtn')?.addEventListener('click', handlers.onRebuild);
    },

    setFiles(files) {
      const list = this.$('fileList');
      list.innerHTML = files.map((f) =>
        `<div class="file-pill"><span title="${PdfConverter.Utils.escapeHtml(f.name)}">${PdfConverter.Utils.escapeHtml(f.name)}</span><b>${PdfConverter.Utils.formatBytes(f.size)}</b></div>`
      ).join('');
      this.$('startBtn').disabled = files.length === 0;
    },

    setBusy(busy, hasFiles) {
      this.$('startBtn').disabled = busy || !hasFiles;
      this.$('cancelBtn').disabled = !busy;
      this.$('fileInput').disabled = busy;
      ['startPhrases', 'stopPhrase', 'scale', 'threshold', 'preprocess'].forEach((id) => {
        const el = this.$(id);
        if (el) el.disabled = busy;
      });
    },

    setProgress(pct, title, status, pageInfo) {
      const p = Math.max(0, Math.min(100, pct));
      this.$('bar').style.width = `${p}%`;
      this.$('progressPct').textContent = `${Math.round(p)}%`;
      this.$('progressTitle').textContent = title || 'Готов к работе';
      this.$('status').textContent = status || '';
      if (pageInfo) {
        this.$('currentPage').textContent = pageInfo;
      }
    },

    updateMetrics(metrics) {
      this.$('mFiles').textContent = metrics.files;
      this.$('mPages').textContent = metrics.pages;
      this.$('mSections').textContent = metrics.sections;
      this.$('mTables').textContent = metrics.tables;
    },

    appendLog(entry) {
      const log = this.$('log');
      if (log.dataset.empty === '1') {
        log.textContent = '';
        log.dataset.empty = '0';
      }
      const el = document.createElement('div');
      if (entry.type) el.className = entry.type;
      el.textContent = entry.line;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
    },

    clearLog() {
      const log = this.$('log');
      log.textContent = 'Журнал появится после запуска.';
      log.dataset.empty = '1';
    },

    setExportEnabled(enabled) {
      this.$('excelBtn').disabled = !enabled;
      this.$('zipBtn').disabled = !enabled;
      const rebuild = this.$('rebuildBtn');
      if (rebuild) rebuild.disabled = !enabled;
    },

    renderPreview(state, onToggleTable) {
      const container = this.$('preview');
      if (!container) return;
      if (!state.sections.length) {
        container.innerHTML = '<div class="preview-empty">Фрагменты появятся после распознавания.</div>';
        return;
      }

      let html = '';
      state.sections.forEach((section, si) => {
        html += `<div class="preview-section">
          <h3>Раздел ${si + 1}: ${PdfConverter.Utils.escapeHtml(section.title)}</h3>
          <div class="preview-meta">Стр. ${section.startPage}–${section.endPage} · ${section.fileName}</div>
          <div class="preview-images">`;
        (section.segments || []).forEach((seg) => {
          html += `<figure class="preview-fig">
            <img src="${seg.previewUrl}" alt="Стр. ${seg.page}" loading="lazy" />
            <figcaption>Стр. ${seg.page}</figcaption>
          </figure>`;
        });
        html += `</div><div class="preview-tables">`;
        (section.tables || []).forEach((table) => {
          const checked = table.excluded ? '' : 'checked';
          const cls = table.excluded ? 'table-card excluded' : 'table-card';
          const preview = (table.matrix || []).slice(0, 4).map((r) =>
            `<tr>${r.map((c) => `<td>${PdfConverter.Utils.escapeHtml(String(c || ''))}</td>`).join('')}</tr>`
          ).join('');
          html += `<div class="${cls}" data-table-id="${PdfConverter.Utils.escapeHtml(table.id)}">
            <label><input type="checkbox" class="table-toggle" data-table-id="${PdfConverter.Utils.escapeHtml(table.id)}" ${checked} />
            Включить таблицу · стр. ${table.page}${table.merged ? ' (объединено)' : ''}</label>
            <div class="table-mini"><table>${preview}</table></div>
          </div>`;
        });
        html += `</div></div>`;
      });
      container.innerHTML = html;

      container.querySelectorAll('.table-toggle').forEach((input) => {
        input.addEventListener('change', () => onToggleTable(input.dataset.tableId, input.checked));
      });
    },

    refreshTableCount(state) {
      let count = 0;
      state.sections.forEach((s) => { count += TableMerger.countActiveTables(s.tables); });
      state.metrics.tables = count;
      this.updateMetrics(state.metrics);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
