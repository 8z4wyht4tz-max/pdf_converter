(function (global) {
  'use strict';

  const PdfConverter = global.PdfConverter = global.PdfConverter || {};

  /**
   * Чистая логика state machine разделов.
   * После стоп-фразы выставляется searchFromY — следующие ключевые фразы
   * принимаются только ниже этой координаты (повторный поиск).
   */
  PdfConverter.SectionStateMachine = {
    createState() {
      return {
        active: null,
        sectionCounter: 0,
        searchFromY: 0,
        cursorY: null
      };
    },

    beginPage(state, continuingSection) {
      if (!state.active) {
        state.searchFromY = 0;
      }
      state.cursorY = state.active ? 0 : null;
      return state;
    },

  /**
   * @returns {{ state, actions: Array }}
   */
    processEvents(state, events, ctx) {
      const { pageNum, pageHeight, stop } = ctx;
      const actions = [];

      for (const event of events) {
        if (!state.active && event.kind === 'start') {
          if (event.y0 < state.searchFromY - 5) {
            actions.push({
              type: 'skip_start',
              reason: 'above_search_from_y',
              pageNum,
              y0: event.y0,
              searchFromY: state.searchFromY
            });
            continue;
          }
          state.sectionCounter++;
          state.active = {
            id: ctx.makeSectionId(state.sectionCounter),
            title: event.phrase,
            recognizedTitle: event.recognized,
            startPage: pageNum,
            endPage: pageNum,
            startScore: event.score,
            stopFound: false,
            phraseLog: [{
              type: 'start', page: pageNum, phrase: event.phrase, score: event.score, text: event.recognized
            }]
          };
          state.cursorY = Math.min(pageHeight, event.y1 + Math.max(8, pageHeight * 0.004));
          actions.push({ type: 'section_start', section: state.active, pageNum });
          continue;
        }

        if (state.active && event.kind === 'stop' && event.y0 >= (state.cursorY ?? 0)) {
          const closing = state.active;
          actions.push({
            type: 'section_stop',
            section: closing,
            pageNum,
            y0: state.cursorY ?? 0,
            y1: event.y0,
            score: event.score,
            recognized: event.recognized
          });
          closing.endPage = pageNum;
          closing.stopFound = true;
          closing.stopScore = event.score;
          closing.phraseLog.push({
            type: 'stop', page: pageNum, phrase: stop, score: event.score, text: event.recognized
          });
          actions.push({ type: 'section_finalize', section: closing });
          state.active = null;
          state.cursorY = null;
          state.searchFromY = event.y1 + Math.max(8, pageHeight * 0.004);
          actions.push({
            type: 'resume_search',
            pageNum,
            searchFromY: state.searchFromY,
            message: `Повторный поиск ключевых фраз ниже стоп-фразы (Y ≥ ${Math.round(state.searchFromY)})`
          });
        }
      }

      if (state.active && pageHeight > (state.cursorY ?? 0) + 15) {
        actions.push({
          type: 'page_tail',
          pageNum,
          y0: state.cursorY ?? 0,
          y1: pageHeight
        });
      }

      return { state, actions };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
