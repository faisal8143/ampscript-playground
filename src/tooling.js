/*!
 * Editor and CLI helpers shared by the VS Code extension and the command-line tool.
 * Browser-safe: no Node.js APIs here.
 * MIT License (c) Faisal Irfan
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ampscript.js'));
  else root.AMPscriptTooling = factory(root.AMPscript);
})(typeof self !== 'undefined' ? self : this, function (AMPscript) {
  'use strict';

  var SYSTEM = /^(emailaddr|emailaddress|_subscriberkey|subscriberkey|subscriberid|listid|jobid|_messagecontext|emailname_|member_\w+|view_email_url|unsub_center_url|profile_center_url|subscription_center_url|forward_url|\w+_url|_\w+)$/i;

  function hasAmpscript(text) {
    return /%%\[|%%=|%%[A-Za-z_][\w ]*%%|runat\s*=\s*["']?server/i.test(text || '');
  }

  function lineOf(text, index) {
    var n = 1;
    for (var i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
  }

  /** Best-effort line number for an engine warning (warnings carry names, not positions). */
  function locateWarning(text, warning) {
    var m = /%%([^%]+)%%/.exec(warning) || /Variable (@\w+)/.exec(warning) || /Attribute "([^"]+)"/.exec(warning) ||
      /(\w+)\("([^"]+)"\)/.exec(warning);
    if (!m) return null;
    var needle = m[0].indexOf('%%') === 0 ? m[0] : m[1];
    if (m[2]) needle = m[2];
    var idx = text.toLowerCase().indexOf(String(needle).toLowerCase());
    return idx < 0 ? null : lineOf(text, idx);
  }

  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (x) { var k = String(x).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  }

  function stringArgs(argText) {
    var out = [], re = /"((?:[^"]|"")*)"|'((?:[^']|'')*)'|(@\w+|[^,()\s]+)/g, m;
    while ((m = re.exec(argText))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : null);
    return out;
  }

  /** Guess a starter test-data file from the attributes, data extensions and blocks a template uses. */
  function scaffoldData(text) {
    text = String(text || '');
    var attrs = [], des = {}, blocks = [], params = [];
    var m, re;

    re = /%%([A-Za-z_][\w ]{0,99}?)%%/g;
    while ((m = re.exec(text))) if (!SYSTEM.test(m[1])) attrs.push(m[1]);
    re = /AttributeValue\(\s*["']([^"']+)["']\s*\)/gi;
    while ((m = re.exec(text))) if (!SYSTEM.test(m[1])) attrs.push(m[1]);
    re = /\[([A-Za-z_][\w ]{0,60})\]/g;
    var code = (text.match(/%%\[[\s\S]*?\]%%|%%=[\s\S]*?=%%/g) || []).join('\n');
    while ((m = re.exec(code))) if (!SYSTEM.test(m[1])) attrs.push(m[1]);

    re = /\b(Lookup|LookupRows|LookupOrderedRows|InsertDE|UpsertDE|UpdateDE|DeleteDE|InsertData|UpsertData|UpdateData|DeleteData|DataExtensionRowCount)\s*\(([^)]*)\)/gi;
    while ((m = re.exec(text))) {
      var fn = m[1].toLowerCase(), a = stringArgs(m[2]);
      var name = a[0];
      if (!name) continue;
      var fields = des[name] || (des[name] = []);
      var pairsFrom = fn === 'lookup' ? 2 : fn === 'lookuprows' ? 1 : fn === 'lookuporderedrows' ? 3 :
        /^(upsert|update)/.test(fn) ? 2 : fn === 'dataextensionrowcount' ? 99 : 1;
      if (fn === 'lookup' && a[1]) fields.push(a[1]);
      if (fn === 'lookuporderedrows' && a[2]) a[2].split(',').forEach(function (o) { var f = o.trim().split(/\s+/)[0]; if (f) fields.push(f); });
      for (var i = pairsFrom; i < a.length; i += 2) if (a[i]) fields.push(a[i]);
    }
    re = /\bField\s*\(\s*(?:Row\s*\([^)]*\)|[^,()]+)\s*,\s*["']([^"']+)["']/gi;
    var fieldNames = [];
    while ((m = re.exec(text))) fieldNames.push(m[1]);

    re = /ContentBlockBy(?:Key|Name|Id)\(\s*["']([^"']+)["']/gi;
    while ((m = re.exec(text))) blocks.push(m[1]);
    re = /(?:RequestParameter|QueryStringParameter)\(\s*["']([^"']+)["']/gi;
    while ((m = re.exec(text))) params.push(m[1]);

    var subscriber = { SubscriberKey: '0035g000001TEST', EmailAddress: 'test@example.com' };
    uniq(attrs).forEach(function (a) { if (!(a in subscriber)) subscriber[a] = 'Sample ' + a; });

    var dataExtensions = {};
    var deNames = Object.keys(des);
    deNames.forEach(function (name) {
      var cols = uniq(des[name].concat(deNames.length === 1 ? fieldNames : []));
      var row = {};
      cols.forEach(function (c) { row[c] = /date/i.test(c) ? '2026-01-15' : /email/i.test(c) ? 'test@example.com' : /key/i.test(c) ? '0035g000001TEST' : 'Sample ' + c; });
      dataExtensions[name] = Object.keys(row).length ? [row] : [];
    });

    var contentBlocks = {};
    uniq(blocks).forEach(function (b) { contentBlocks[b] = '<p>Content block ' + b + '</p>'; });
    var requestParameters = {};
    uniq(params).forEach(function (p) { requestParameters[p] = 'sample'; });

    var data = { subscribers: [subscriber], dataExtensions: dataExtensions, contentBlocks: contentBlocks };
    if (params.length) data.requestParameters = requestParameters;
    data.now = '2026-10-08T09:00:00';
    return data;
  }

  /** Normalise a data object: accepts { subscriber } or { subscribers: [] }. */
  function subscribersOf(data) {
    if (!data) return [{}];
    if (Array.isArray(data.subscribers) && data.subscribers.length) return data.subscribers;
    if (data.subscriber && typeof data.subscriber === 'object') return [data.subscriber];
    return [{}];
  }

  function subscriberLabel(sub, i) {
    var name = [sub.FirstName || sub.first_name || sub.Firstname, sub.LastName || sub.last_name].filter(Boolean).join(' ');
    var email = sub.EmailAddress || sub.Email || sub.emailaddr || sub.email;
    return sub._label || name || email || ('Subscriber ' + (i + 1));
  }

  /** Render a template with one subscriber from a data object. */
  function renderWith(text, data, index) {
    data = data || {};
    var subs = subscribersOf(data);
    var sub = subs[Math.min(Math.max(index || 0, 0), subs.length - 1)];
    return AMPscript.render(text, {
      subscriber: sub,
      dataExtensions: data.dataExtensions || {},
      contentBlocks: data.contentBlocks || {},
      requestParameters: data.requestParameters || {},
      now: data.now || null
    });
  }

  /** Problems for every subscriber, de-duplicated: [{ severity, line, message, subscriber }]. */
  function check(text, data) {
    var out = [], seen = {};
    subscribersOf(data).forEach(function (sub, i) {
      var r = renderWith(text, data, i);
      var label = subscribersOf(data).length > 1 ? subscriberLabel(sub, i) : null;
      r.errors.forEach(function (e) { push('error', e.line, e.message, label); });
      r.warnings.forEach(function (w) { push('warning', locateWarning(text, w), w, label); });
    });
    function push(severity, line, message, label) {
      var key = severity + '|' + line + '|' + message;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ severity: severity, line: line, message: message, subscriber: label });
    }
    return out;
  }

  return {
    hasAmpscript: hasAmpscript,
    locateWarning: locateWarning,
    scaffoldData: scaffoldData,
    subscribersOf: subscribersOf,
    subscriberLabel: subscriberLabel,
    renderWith: renderWith,
    check: check
  };
});
