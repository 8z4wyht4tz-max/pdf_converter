#!/usr/bin/env node
/**
 * Собирает самодостаточный HTML со встроенными модулями.
 * Запуск: node build.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MODULES = [
  'js/utils.js',
  'js/text-normalizer.js',
  'js/table-builder.js',
  'js/phrase-matcher.js',
  'js/pdf-loader.js',
  'js/pdf-renderer.js',
  'js/image-preprocessor.js',
  'js/ocr-engine.js',
  'js/table-detector.js',
  'js/table-merger.js',
  'js/section-state-machine.js',
  'js/error-logger.js',
  'js/section-detector.js',
  'js/excel-builder.js',
  'js/ui-controller.js',
  'js/app.js'
];

const template = readFileSync(join(__dirname, 'PDF_конвертер_таблиц.template.html'), 'utf8');
const bundled = MODULES.map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\n\n');
const output = template.replace('/* __BUNDLED_MODULES__ */', bundled);
writeFileSync(join(__dirname, 'PDF_конвертер_таблиц.html'), output, 'utf8');
console.log('Собран: PDF_конвертер_таблиц.html (' + MODULES.length + ' модулей)');
