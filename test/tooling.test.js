'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const tooling = require('../src/tooling.js');
const functions = require('../src/functions.js');
const { findData, parseCsv } = require('../src/project-data.js');

const FIX = path.join(__dirname, 'fixtures');
const CLI = path.join(__dirname, '..', 'bin', 'ampscript.js');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

// --- Data loading ---------------------------------------------------------------------

test('CSV parser handles quotes, commas, CRLF and BOM', () => {
  const rows = parseCsv('﻿a,b\r\n1,"x, ""y"""\r\n2,\r\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, "y"' }, { a: '2', b: '' }]);
});

test('finds <name>.data.json next to the template', () => {
  const data = findData(path.join(FIX, 'json', 'offer.html'));
  assert.equal(path.basename(data.source), 'offer.data.json');
  assert.equal(data.subscribers.length, 2);
});

test('reads the AMPscript Core folder layout', () => {
  const data = findData(path.join(FIX, 'core-layout', 'welcome.ampscript'));
  assert.match(data.source, /AMPscript Core layout/);
  assert.equal(data.subscribers[0].first_name, 'Ana');
  assert.equal(data.dataExtensions.Members[0].Note, 'Likes "quotes", commas');
  assert.ok(data.contentBlocks.footer);
  const r = tooling.renderWith(fs.readFileSync(path.join(FIX, 'core-layout', 'welcome.ampscript'), 'utf8'), data, 0);
  assert.deepEqual(r.errors, []);
  assert.match(r.html, /Hi Ana/);
  assert.match(r.html, /Gold perks/);
  assert.match(r.html, /<footer>Bye Ana<\/footer>/);
});

test('shared ampscript.data.json in a parent folder, with CSV folder reference', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-'));
  fs.mkdirSync(path.join(dir, 'emails'));
  fs.mkdirSync(path.join(dir, 'des'));
  fs.writeFileSync(path.join(dir, 'des', 'Orders.csv'), 'Id,Total\n1,50\n');
  fs.writeFileSync(path.join(dir, 'ampscript.data.json'), JSON.stringify({ subscriber: { FirstName: 'Zoe' }, dataExtensions: 'des' }));
  fs.writeFileSync(path.join(dir, 'emails', 'a.html'), 'x');
  const data = findData(path.join(dir, 'emails', 'a.html'));
  assert.equal(data.dataExtensions.Orders[0].Total, '50');
  assert.deepEqual(tooling.subscribersOf(data), [{ FirstName: 'Zoe' }]);
});

test('no data found returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-'));
  fs.writeFileSync(path.join(dir, 'a.html'), 'x');
  assert.equal(findData(path.join(dir, 'a.html'), { stopAt: dir }), null);
});

// --- Tooling --------------------------------------------------------------------------

test('check runs every subscriber and labels problems', () => {
  const text = fs.readFileSync(path.join(FIX, 'json', 'offer.html'), 'utf8');
  const problems = tooling.check(text, findData(path.join(FIX, 'json', 'offer.html')));
  const err = problems.find((p) => p.severity === 'error');
  assert.match(err.message, /"lots" is not a valid number/);
  assert.equal(err.line, 5);
  assert.equal(err.subscriber, 'Bo');
  assert.equal(problems.filter((p) => p.severity === 'error').length, 1, 'Ana renders cleanly');
});

test('check reports warnings with their line', () => {
  const problems = tooling.check('<p>Hi</p>\n<p>%%LastName%%</p>', { subscribers: [{ FirstName: 'Ana' }] });
  assert.deepEqual(problems.map((p) => [p.severity, p.line]), [['warning', 2]]);
});

test('locateWarning finds personalisation strings and variables', () => {
  const text = 'a\nb %%First Name%%\nc\n%%=v(@x)=%%';
  assert.equal(tooling.locateWarning(text, 'Personalization string %%First Name%% has no value in the subscriber data'), 2);
  assert.equal(tooling.locateWarning(text, 'Variable @x is used before it is SET (treated as empty)'), 4);
});

test('scaffoldData guesses attributes, data extensions, blocks and params', () => {
  const tpl = '%%FirstName%% %%emailaddr%% %%[ SET @a = AttributeValue("Tier") SET @r = LookupOrderedRows("Orders", 3, "OrderDate desc", "Email", emailaddr) SET @t = Field(Row(@r,1), "Total") ]%% %%=ContentBlockByKey("footer")=%% %%=RequestParameter("id")=%%';
  const d = tooling.scaffoldData(tpl);
  assert.deepEqual(Object.keys(d.subscribers[0]), ['SubscriberKey', 'EmailAddress', 'FirstName', 'Tier']);
  assert.deepEqual(Object.keys(d.dataExtensions.Orders[0]), ['OrderDate', 'Email', 'Total']);
  assert.ok(d.contentBlocks.footer);
  assert.deepEqual(d.requestParameters, { id: 'sample' });
  const r = tooling.renderWith(tpl, d, 0);
  assert.deepEqual(r.errors, [], 'scaffold renders without errors');
});

test('hasAmpscript', () => {
  assert.equal(tooling.hasAmpscript('<p>plain</p>'), false);
  assert.equal(tooling.hasAmpscript('<p>%%FirstName%%</p>'), true);
  assert.equal(tooling.hasAmpscript('100% off, 50% more'), false);
});

test('function reference has signatures for every function', () => {
  assert.equal(functions.get('lookuporderedrows').name, 'LookupOrderedRows');
  assert.match(functions.signature(functions.get('substring')), /^Substring\(string, start, \[length\]\)$/);
  functions.list.forEach((f) => assert.ok(f.description.length > 10, f.name));
});

// --- CLI ------------------------------------------------------------------------------

test('cli: render prints HTML; --subscriber and --out work', () => {
  const r = run('render', path.join(FIX, 'core-layout', 'welcome.ampscript'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Hi Ana/);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'amp-')), 'out.html');
  const r2 = run('render', path.join(FIX, 'json', 'offer.html'), '--subscriber', '1', '--out', out);
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(fs.readFileSync(out, 'utf8'), /1,200 points/);
});

test('cli: render exits 1 with file:line on errors', () => {
  const r = run('render', path.join(FIX, 'json', 'broken.html'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /broken\.html:1: error: IF on line 1 is missing its ENDIF/);
});

test('cli: check reports errors per subscriber and fails', () => {
  const r = run('check', path.join(FIX, 'json'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /offer\.html:5: error: .*\[Bo\]/);
  assert.match(r.stdout, /broken\.html:1: error/);
  assert.match(r.stderr, /Checked 2 templates: 2 errors/);
});

test('cli: check passes on good templates; --strict fails on warnings; github format', () => {
  assert.equal(run('check', path.join(FIX, 'core-layout')).status, 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-'));
  fs.writeFileSync(path.join(dir, 'w.html'), '<p>%%Missing%%</p>');
  assert.equal(run('check', dir).status, 0);
  const strict = run('check', dir, '--strict', '--format', 'github');
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /^::error file=.*w\.html,line=1::Personalization string %%Missing%%/m);
});

test('cli: init writes a data file that renders cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-'));
  const tpl = path.join(dir, 'promo.html');
  fs.writeFileSync(tpl, '%%[ SET @p = Lookup("Promo", "Code", "Email", emailaddr) ]%%<p>%%FirstName%% %%=v(@p)=%%</p>');
  const r = run('init', tpl);
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'promo.data.json'), 'utf8'));
  assert.ok(data.dataExtensions.Promo);
  assert.equal(run('check', dir, '--strict').status, 0);
  assert.equal(run('init', tpl).status, 2, 'refuses to overwrite');
});

test('cli: help, version and bad input', () => {
  assert.match(execFileSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' }), /Usage/);
  assert.match(execFileSync(process.execPath, [CLI, '-v'], { encoding: 'utf8' }), /^\d+\.\d+\.\d+/);
  assert.equal(run('nope').status, 2);
  assert.equal(run('render').status, 2);
});
