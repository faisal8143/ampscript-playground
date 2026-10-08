'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { createMock } = require('./mock-vscode.js');

const { vscode, state, listeners, makeDocument } = createMock();
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return vscode;
  return realLoad.call(this, request, ...rest);
};
const ext = require('../extension.js');
const { previewHtml } = require('../preview-html.js');

// Fixtures in a temp folder
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ampx-'));
const src = path.join(__dirname, '..', '..', 'test', 'fixtures', 'json');
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dir, f));
const offer = makeDocument(path.join(dir, 'offer.html'), 'html');
vscode.workspace.textDocuments.push(offer);
vscode.window.activeTextEditor = { document: offer };
const context = { subscriptions: [] };
ext.activate(context);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('activation registers commands, providers and status bar', () => {
  assert.deepEqual(Object.keys(state.commands).sort(), ['ampscript.chooseSubscriber', 'ampscript.createDataFile', 'ampscript.openPreview']);
  assert.equal(state.providers.completion.length, 1);
  assert.ok(state.status.visible);
  assert.equal(state.status.text, '$(account) Ana Lee (1/2)');
});

test('diagnostics: error on the right line with the subscriber named', () => {
  const list = state.diagnostics.get(offer.uri.toString());
  const err = list.find((d) => d.severity === vscode.DiagnosticSeverity.Error);
  assert.equal(err.range.start.line, 4);
  assert.match(err.message, /"lots" is not a valid number \(subscriber: Bo\)/);
  assert.equal(err.source, 'AMPscript');
});

test('diagnostics can be switched off', () => {
  state.config['diagnostics.enable'] = false;
  ext._internal.updateDiagnostics(offer);
  assert.equal(state.diagnostics.has(offer.uri.toString()), false);
  delete state.config['diagnostics.enable'];
  ext._internal.updateDiagnostics(offer);
  assert.ok(state.diagnostics.get(offer.uri.toString()).length);
});

test('plain HTML files get no diagnostics', () => {
  const p = path.join(dir, 'plain.html');
  fs.writeFileSync(p, '<p>Save 50% today</p>');
  const doc = makeDocument(p, 'html');
  ext._internal.updateDiagnostics(doc);
  assert.equal(state.diagnostics.has(doc.uri.toString()), false);
});

test('completion only inside AMPscript code', () => {
  const p = path.join(dir, 'c.html');
  fs.writeFileSync(p, '<p>Look</p>\n%%[ SET @a = Lo ]%%\n<p>%%=Upp=%%</p>');
  const doc = makeDocument(p, 'html');
  const provider = state.providers.completion[0];
  assert.equal(provider.provideCompletionItems(doc, new vscode.Position(0, 6)), undefined, 'not in HTML text');
  const items = provider.provideCompletionItems(doc, new vscode.Position(1, 15));
  const lookup = items.find((i) => i.label === 'Lookup');
  assert.equal(lookup.insertText.value, 'Lookup($1)');
  assert.match(lookup.detail, /^Lookup\(deName, returnField/);
  assert.ok(provider.provideCompletionItems(doc, new vscode.Position(2, 10)), 'inline output counts as code');
  assert.equal(provider.provideCompletionItems(doc, new vscode.Position(2, 16)), undefined, 'after =%% is HTML again');
});

test('hover and signature help', () => {
  const p = path.join(dir, 'h.html');
  fs.writeFileSync(p, '%%[ SET @x = Substring(@a, 2, ');
  const doc = makeDocument(p, 'html');
  const hover = state.providers.hover[0].provideHover(doc, new vscode.Position(0, 15));
  assert.match(hover.contents.value, /Substring\(string, start, \[length\]\)/);
  const sig = state.providers.signature[0].provideSignatureHelp(doc, new vscode.Position(0, 30));
  assert.equal(sig.signatures[0].label, 'Substring(string, start, [length])');
  assert.equal(sig.activeParameter, 2);
});

test('preview renders, switches subscriber and view', async () => {
  state.commands['ampscript.openPreview']();
  const panel = state.panels[0];
  assert.match(panel.webview.html, /Hi Ana, you have 1,200 points/);
  assert.match(panel.webview.html, /<option value="1">Bo<\/option>/);
  assert.match(panel.webview.html, /Content-Security-Policy/);
  panel._send({ type: 'subscriber', index: 1 });
  assert.match(panel.webview.html, /&quot;lots&quot; is not a valid number/);
  assert.match(panel.webview.html, /Fix the error above/);
  assert.equal(state.status.text, '$(account) Bo (2/2)');
  panel._send({ type: 'mobile', value: true });
  assert.match(panel.webview.html, /class="stage mobile"/);
  state.commands['ampscript.openPreview']();
  assert.equal(state.panels.length, 1, 'second open reveals the same panel');
  assert.ok(panel.revealed);
  panel._dispose();
  assert.equal(ext._internal.panels.size, 0);
});

test('preview and diagnostics update after edits (debounced)', async () => {
  state.commands['ampscript.openPreview']();
  const panel = state.panels[1];
  panel._send({ type: 'subscriber', index: 0 });
  offer._setText(fs.readFileSync(offer.fileName, 'utf8').replace('<p>Hi ', '<p>Hello ').replace('"N0"', '"N0"'));
  listeners.change.forEach((fn) => fn({ document: offer }));
  assert.doesNotMatch(panel.webview.html, /Hello Ana/, 'not re-rendered before the debounce');
  await wait(400);
  assert.match(panel.webview.html, /Hello Ana/);
});

test('create test data file scaffolds from the template', async () => {
  const p = path.join(dir, 'promo.html');
  fs.writeFileSync(p, '%%[ SET @c = Lookup("Promo", "Code", "Email", emailaddr) ]%%<p>%%FirstName%% %%=v(@c)=%%</p>');
  const doc = makeDocument(p, 'html');
  vscode.window.activeTextEditor = { document: doc };
  await state.commands['ampscript.createDataFile']();
  const target = path.join(dir, 'promo.data.json');
  const data = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.ok(data.dataExtensions.Promo[0].Code);
  assert.equal(state.opened.at(-1), target);
  await state.commands['ampscript.createDataFile']();
  assert.equal(state.opened.at(-1), target, 'existing file is opened, not overwritten');
});

test('invalid data file shows a warning instead of crashing', () => {
  const p = path.join(dir, 'bad.html');
  fs.writeFileSync(p, '<p>%%FirstName%%</p>');
  fs.writeFileSync(path.join(dir, 'bad.data.json'), '{ nope');
  const doc = makeDocument(p, 'html');
  ext._internal.updateDiagnostics(doc);
  const list = state.diagnostics.get(doc.uri.toString());
  assert.match(list[0].message, /^Test data: bad\.data\.json is not valid JSON/);
});

test('preview HTML escapes content and blocks scripts in the email', () => {
  const html = previewHtml({
    nonce: 'abc', cspSource: 'x', fileName: '<f>.html', subscribers: ['<b>Ana</b>'], selected: 0, dataSource: null, dataError: null, mobile: false,
    result: { html: '<script>alert(1)</script><p>Hi</p>', errors: [], warnings: ['%%X%% <i>'], log: [], raised: false }
  });
  assert.ok(html.includes('&lt;b&gt;Ana&lt;/b&gt;'));
  assert.ok(html.includes('&lt;i&gt;'));
  assert.ok(/<iframe[^>]+sandbox="allow-popups allow-popups-to-escape-sandbox"/.test(html), 'email iframe has no allow-scripts');
  assert.ok(html.includes("script-src 'nonce-abc'"));
});

test('lib copies are in sync with src', () => {
  for (const f of ['ampscript.js', 'tooling.js', 'functions.js', 'project-data.js']) {
    const lib = fs.readFileSync(path.join(__dirname, '..', 'lib', f), 'utf8').split('\n').slice(1).join('\n');
    const s = fs.readFileSync(path.join(__dirname, '..', '..', 'src', f), 'utf8');
    assert.equal(lib, s, f + ' is out of date. Run npm run sync:vscode');
  }
});
