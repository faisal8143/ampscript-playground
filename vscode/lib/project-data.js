// GENERATED from src/project-data.js by scripts/sync-vscode.js. Do not edit.
/*!
 * Finds and loads test data for a template file (Node.js only).
 *
 * Looks for, in order:
 *   1. an explicit data file
 *   2. <template-name>.data.json next to the template
 *   3. the nearest ampscript.data.json in the folder or a parent folder
 *   4. an AMPscript Core style folder: subscriber.json, DataExtensions/*.csv, Content/*
 *
 * MIT License (c) Faisal Irfan
 */
'use strict';
const fs = require('fs');
const path = require('path');

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error(`${path.basename(file)} is not valid JSON: ${e.message}`);
    err.file = file;
    throw err;
  }
}

/** RFC 4180 CSV → array of row objects keyed by the header row. */
function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; });
    return o;
  });
}

function stem(file) {
  return path.basename(file).replace(/\.[^.]+$/, '');
}

function loadCsvFolder(dir) {
  const des = {};
  if (!fs.existsSync(dir)) return des;
  for (const f of fs.readdirSync(dir)) {
    if (/\.csv$/i.test(f)) des[stem(f)] = parseCsv(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return des;
}

function loadContentFolder(dir) {
  const blocks = {};
  if (!fs.existsSync(dir)) return blocks;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isFile()) {
      const text = fs.readFileSync(full, 'utf8');
      blocks[f] = text;
      if (!(stem(f) in blocks)) blocks[stem(f)] = text;
    }
  }
  return blocks;
}

/** Load a data JSON file and resolve its optional folder references. */
function loadDataFile(file) {
  const data = readJson(file);
  const base = path.dirname(file);
  if (typeof data.dataExtensions === 'string') data.dataExtensions = loadCsvFolder(path.resolve(base, data.dataExtensions));
  if (typeof data.contentBlocks === 'string') data.contentBlocks = loadContentFolder(path.resolve(base, data.contentBlocks));
  data.source = file;
  return data;
}

function loadCoreLayout(dir) {
  const subFile = path.join(dir, 'subscriber.json');
  const data = {
    subscribers: fs.existsSync(subFile) ? [].concat(readJson(subFile)) : [{}],
    dataExtensions: loadCsvFolder(path.join(dir, 'DataExtensions')),
    contentBlocks: loadContentFolder(path.join(dir, 'Content')),
    source: dir + path.sep + ' (AMPscript Core layout)'
  };
  return data;
}

function isCoreLayout(dir) {
  return ['subscriber.json', 'DataExtensions', 'Content'].some((n) => fs.existsSync(path.join(dir, n)));
}

/**
 * Find the data for a template.
 * @param {string} templateFile
 * @param {{ dataFile?: string, stopAt?: string }} [options]
 * @returns {object|null} data, with `source` set to where it came from, or null when none is found
 */
function findData(templateFile, options = {}) {
  if (options.dataFile) return loadDataFile(path.resolve(options.dataFile));
  const dir = path.dirname(path.resolve(templateFile));
  const sibling = path.join(dir, stem(templateFile) + '.data.json');
  if (fs.existsSync(sibling)) return loadDataFile(sibling);

  const stopAt = options.stopAt ? path.resolve(options.stopAt) : null;
  let current = dir;
  for (;;) {
    const shared = path.join(current, 'ampscript.data.json');
    if (fs.existsSync(shared)) return loadDataFile(shared);
    if (isCoreLayout(current)) return loadCoreLayout(current);
    const parent = path.dirname(current);
    if (parent === current || (stopAt && current === stopAt)) break;
    current = parent;
  }
  return null;
}

module.exports = { findData, loadDataFile, parseCsv, stem };
