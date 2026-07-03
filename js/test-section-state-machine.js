/**
 * Unit-тест: после стоп-фразы повторно ищутся ключевые фразы.
 * Запуск: node js/test-section-state-machine.js
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadModule(file) {
  const ctx = { window: {}, globalThis: {} };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(join(root, file), 'utf8'), ctx);
  return ctx.PdfConverter;
}

const PC = loadModule('js/section-state-machine.js');
const SM = PC.SectionStateMachine;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

console.log('Тест 1: стоп → повторный старт на той же странице');
{
  const state = SM.createState();
  SM.beginPage(state, false);
  const events = [
    { kind: 'start', phrase: 'Фраза A', recognized: 'Фраза A', score: 0.9, y0: 100, y1: 130 },
    { kind: 'stop', phrase: 'в штат', recognized: 'в штат', score: 0.85, y0: 500, y1: 520 },
    { kind: 'start', phrase: 'Фраза B', recognized: 'Фраза B', score: 0.88, y0: 600, y1: 630 }
  ];
  const { state: s1, actions } = SM.processEvents(state, events, {
    pageNum: 1, pageHeight: 1000, stop: 'в штат',
    makeSectionId: (n) => `sec_${n}`
  });
  assert(actions.some((a) => a.type === 'resume_search'), 'есть действие resume_search');
  assert(s1.sectionCounter === 2, 'открыто 2 раздела');
  assert(actions.filter((a) => a.type === 'section_finalize').length === 1, 'первый раздел закрыт');
  assert(actions.filter((a) => a.type === 'section_start').length === 2, 'второй раздел стартовал после стопа');
  assert(s1.searchFromY > 520, 'searchFromY ниже стоп-фразы');
}

console.log('\nТест 2: старт выше searchFromY пропускается (на той же странице после стопа)');
{
  const state = SM.createState();
  state.searchFromY = 550;
  // beginPage не вызывается повторно внутри страницы — searchFromY сохраняется
  const events = [
    { kind: 'start', phrase: 'Старая', recognized: 'Старая', score: 0.9, y0: 200, y1: 230 },
    { kind: 'start', phrase: 'Новая', recognized: 'Новая', score: 0.9, y0: 700, y1: 730 }
  ];
  const { state: s2, actions } = SM.processEvents(state, events, {
    pageNum: 2, pageHeight: 1000, stop: 'в штат',
    makeSectionId: (n) => `sec_${n}`
  });
  assert(actions.some((a) => a.type === 'skip_start'), 'старт выше searchFromY пропущен');
  assert(s2.sectionCounter === 1, 'принят только один старт ниже searchFromY');
  assert(s2.active?.title === 'Новая', 'активен новый раздел');
}

console.log('\nТест 3: на новой странице searchFromY сбрасывается');
{
  const state = SM.createState();
  state.searchFromY = 800;
  state.active = null;
  SM.beginPage(state, false);
  assert(state.searchFromY === 0, 'searchFromY сброшен в 0 на новой странице без активного раздела');
}

console.log(`\nИтого: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
