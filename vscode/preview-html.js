'use strict';
// Builds the HTML for the preview panel. Kept free of the vscode API so it can be unit tested.

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {object} p
 * @param {string} p.nonce
 * @param {string} p.cspSource
 * @param {string} p.fileName
 * @param {string[]} p.subscribers   labels
 * @param {number} p.selected
 * @param {string|null} p.dataSource
 * @param {{html:string, errors:Array, warnings:string[], log:string[], raised:boolean}} p.result
 * @param {string|null} p.dataError
 * @param {boolean} p.mobile
 */
function previewHtml(p) {
  const r = p.result;
  const failed = r.errors.length && !r.raised;
  const items = []
    .concat(p.dataError ? [{ k: 'err', t: 'Test data', m: p.dataError }] : [])
    .concat(r.errors.map((e) => ({ k: 'err', t: e.line ? 'Line ' + e.line : 'Error', m: e.message })))
    .concat(r.warnings.map((w) => ({ k: 'warn', t: 'Warning', m: w })))
    .concat(r.log.map((l) => ({ k: 'log', t: 'Data', m: l })));

  const options = p.subscribers.map((label, i) =>
    `<option value="${i}"${i === p.selected ? ' selected' : ''}>${esc(label)}</option>`).join('');

  const email = '<!doctype html><html><head><meta charset="utf-8"><base target="_blank">' +
    '<style>body{margin:0;background:#fff;color:#222}</style></head><body>' + r.html + '</body></html>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: ${p.cspSource}; style-src 'unsafe-inline' ${p.cspSource}; font-src https: data:; script-src 'nonce-${p.nonce}'; frame-src about: data:;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 13px/1.45 var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .bar { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); position: sticky; top: 0; background: var(--vscode-editor-background); z-index: 1; }
  .bar label { color: var(--vscode-descriptionForeground); }
  select, button { font: inherit; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent); border-radius: 2px; padding: 2px 6px; }
  button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .src { color: var(--vscode-descriptionForeground); margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%; }
  ul { list-style: none; margin: 0; padding: 6px 12px; display: grid; gap: 4px; }
  li { padding: 4px 8px; border-left: 3px solid; }
  li.err { border-color: var(--vscode-errorForeground); }
  li.warn { border-color: var(--vscode-editorWarning-foreground); }
  li.log { border-color: var(--vscode-textLink-foreground); }
  li b { margin-right: 6px; }
  .stage { padding: 12px; display: flex; justify-content: center; }
  iframe { border: 1px solid var(--vscode-panel-border); background: #fff; width: 100%; height: calc(100vh - 120px); min-height: 400px; }
  .mobile iframe { width: 375px; max-width: 100%; }
  .failed { padding: 24px 12px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div class="bar">
  <label for="sub">Subscriber</label>
  <select id="sub"${p.subscribers.length < 2 ? ' disabled' : ''}>${options}</select>
  <button type="button" id="desktop" aria-pressed="${!p.mobile}">Desktop</button>
  <button type="button" id="mobile" aria-pressed="${!!p.mobile}">Mobile</button>
  <span class="src" title="${esc(p.dataSource || '')}">${p.dataSource ? 'Data: ' + esc(p.dataSource) : 'No test data file. Run "AMPscript: Create Test Data File".'}</span>
</div>
${items.length ? '<ul>' + items.map((i) => `<li class="${i.k}"><b>${esc(i.t)}</b>${esc(i.m)}</li>`).join('') + '</ul>' : ''}
<div class="stage${p.mobile ? ' mobile' : ''}">
  ${failed ? '<p class="failed">Fix the error above to see the preview.</p>' : `<iframe title="Preview of ${esc(p.fileName)}" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(email)}"></iframe>`}
</div>
<script nonce="${p.nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById('sub').addEventListener('change', (e) => vscode.postMessage({ type: 'subscriber', index: Number(e.target.value) }));
  document.getElementById('desktop').addEventListener('click', () => vscode.postMessage({ type: 'mobile', value: false }));
  document.getElementById('mobile').addEventListener('click', () => vscode.postMessage({ type: 'mobile', value: true }));
</script>
</body>
</html>`;
}

module.exports = { previewHtml, esc };
