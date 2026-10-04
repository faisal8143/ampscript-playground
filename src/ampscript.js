/*!
 * AMPscript Playground engine
 * A small AMPscript interpreter that runs in the browser or Node.js, for previewing
 * Salesforce Marketing Cloud emails and CloudPages without an SFMC account.
 *
 * This is NOT Salesforce's engine. It implements the commonly used language features and
 * functions so you can test personalisation logic quickly; always do a final test send in SFMC.
 *
 * MIT License (c) Faisal Irfan — https://github.com/faisal8143/ampscript-playground
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AMPscript = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_LOOP = 100000;

  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  var MAX_DEPTH = 20;

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  function AmpError(message, line) {
    this.name = 'AmpError';
    this.message = message;
    this.line = line || null;
  }
  AmpError.prototype = Object.create(Error.prototype);

  function RaiseError(message) {
    this.name = 'RaiseError';
    this.message = message;
  }
  RaiseError.prototype = Object.create(Error.prototype);

  // ---------------------------------------------------------------------------
  // Lexer: turns a whole template (HTML + AMPscript) into one token stream.
  // HTML between blocks becomes TEXT tokens so IF/FOR can wrap HTML.
  // ---------------------------------------------------------------------------

  var KEYWORDS = {
    'if': 1, 'then': 1, 'elseif': 1, 'else': 1, 'endif': 1,
    'for': 1, 'to': 1, 'downto': 1, 'do': 1, 'next': 1,
    'set': 1, 'var': 1, 'and': 1, 'or': 1, 'not': 1, 'true': 1, 'false': 1
  };

  var SCRIPT_OPEN = /^<script\b[^>]*\brunat\s*=\s*["']?server["']?[^>]*>/i;

  function lex(src) {
    var tokens = [];
    var i = 0;
    var line = 1;
    var text = '';
    var textLine = 1;

    function pushText() {
      if (text) tokens.push({ type: 'TEXT', value: text, line: textLine });
      text = '';
    }
    function advance(n) {
      for (var k = 0; k < n; k++) if (src[i + k] === '\n') line++;
      i += n;
    }

    while (i < src.length) {
      var ch = src[i];

      if (ch === '%' && src[i + 1] === '%' && src[i + 2] === '[') {
        pushText();
        advance(3);
        lexCode(']%%', 'BLOCK');
        textLine = line;
        continue;
      }
      if (ch === '%' && src[i + 1] === '%' && src[i + 2] === '=') {
        pushText();
        var startLine = line;
        advance(3);
        tokens.push({ type: 'INLINE_START', line: startLine });
        lexCode('=%%', 'INLINE');
        tokens.push({ type: 'INLINE_END', line: line });
        textLine = line;
        continue;
      }
      if (ch === '%' && src[i + 1] === '%') {
        var m = /^%%([A-Za-z_][A-Za-z0-9_ ]{0,99}?)%%/.exec(src.slice(i, i + 106));
        if (m) {
          pushText();
          tokens.push({ type: 'PERSONALIZATION', value: m[1], line: line });
          advance(m[0].length);
          textLine = line;
          continue;
        }
      }
      if (ch === '<' && /^<script/i.test(src.slice(i, i + 7))) {
        var sm = SCRIPT_OPEN.exec(src.slice(i, i + 200));
        if (sm && /language\s*=\s*["']?ampscript/i.test(sm[0])) {
          pushText();
          advance(sm[0].length);
          lexCode('</script>', 'SCRIPT');
          textLine = line;
          continue;
        }
      }

      if (!text) textLine = line;
      text += ch;
      advance(1);
    }
    pushText();
    tokens.push({ type: 'EOF', line: line });
    return tokens;

    // Lex AMPscript code until the given terminator
    function lexCode(end, kind) {
      var openLine = line;
      while (true) {
        if (i >= src.length) {
          throw new AmpError(
            kind === 'INLINE' ? 'Inline expression %%= is missing its closing =%%'
              : kind === 'SCRIPT' ? 'AMPscript <script> block is missing </script>'
              : 'Code block %%[ is missing its closing ]%%',
            openLine
          );
        }
        var c = src[i];

        if (src.substr(i, end.length).toLowerCase() === end) {
          if (kind !== 'INLINE') tokens.push({ type: 'BLOCK_END', line: line });
          advance(end.length);
          return;
        }

        if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { advance(1); continue; }

        if (c === '/' && src[i + 1] === '*') {
          var close = src.indexOf('*/', i + 2);
          if (close < 0) throw new AmpError('Comment /* is missing its closing */', line);
          advance(close + 2 - i);
          continue;
        }
        if (c === '/' && src[i + 1] === '/') {
          throw new AmpError('// comments are not valid in AMPscript. Use /* ... */', line);
        }

        if (c === '"' || c === "'" || c === '“' || c === '‘') {
          if (c === '“' || c === '‘') {
            throw new AmpError('Curly quotes (“ ‘) are not valid in AMPscript. Use straight quotes " or \'', line);
          }
          var q = c;
          var startL = line;
          var s = '';
          advance(1);
          while (true) {
            if (i >= src.length) throw new AmpError('String is missing its closing ' + q, startL);
            if (src[i] === q) {
              if (src[i + 1] === q) { s += q; advance(2); continue; }
              advance(1);
              break;
            }
            s += src[i];
            advance(1);
          }
          tokens.push({ type: 'STRING', value: s, line: startL });
          continue;
        }

        var num = /^\d+(\.\d+)?/.exec(src.slice(i, i + 40));
        if (num) { tokens.push({ type: 'NUMBER', value: parseFloat(num[0]), raw: num[0], line: line }); advance(num[0].length); continue; }

        // AMPscript has no minus operator (it uses Subtract()), so "-" always starts a number
        if (c === '-' && /\d/.test(src[i + 1] || '')) {
          var neg = /^-\d+(\.\d+)?/.exec(src.slice(i, i + 40));
          tokens.push({ type: 'NUMBER', value: parseFloat(neg[0]), raw: neg[0], line: line });
          advance(neg[0].length);
          continue;
        }

        if (c === '@') {
          var v = /^@[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 200));
          if (!v) throw new AmpError('Invalid variable name after @', line);
          tokens.push({ type: 'VAR', value: v[0].toLowerCase(), raw: v[0], line: line });
          advance(v[0].length);
          continue;
        }

        if (c === '[') {
          var cb = src.indexOf(']', i + 1);
          var attr = cb < 0 ? '' : src.slice(i + 1, cb);
          if (cb < 0 || /[\n%]/.test(attr)) throw new AmpError('Attribute reference [ is missing its closing ]', line);
          tokens.push({ type: 'ATTR', value: attr, line: line });
          advance(cb + 1 - i);
          continue;
        }

        var id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 200));
        if (id) {
          var low = id[0].toLowerCase();
          tokens.push({ type: has(KEYWORDS, low) ? 'KEYWORD' : 'IDENT', value: low, raw: id[0], line: line });
          advance(id[0].length);
          continue;
        }

        var two = src.substr(i, 2);
        if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '<>') {
          tokens.push({ type: 'OP', value: two === '<>' ? '!=' : two, line: line });
          advance(2);
          continue;
        }
        if (c === '<' || c === '>') { tokens.push({ type: 'OP', value: c, line: line }); advance(1); continue; }
        if (c === '=') { tokens.push({ type: 'EQUALS', line: line }); advance(1); continue; }
        if (c === '(') { tokens.push({ type: 'LPAREN', line: line }); advance(1); continue; }
        if (c === ')') { tokens.push({ type: 'RPAREN', line: line }); advance(1); continue; }
        if (c === ',') { tokens.push({ type: 'COMMA', line: line }); advance(1); continue; }

        throw new AmpError('Unexpected character "' + c + '"', line);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Parser
  // ---------------------------------------------------------------------------

  function parse(tokens) {
    var pos = 0;

    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function isKw(t, kw) { return t.type === 'KEYWORD' && t.value === kw; }
    function describe(t) {
      if (t.type === 'EOF') return 'end of template';
      if (t.type === 'TEXT') return 'HTML text';
      if (t.type === 'INLINE_END') return '=%%';
      if (t.type === 'BLOCK_END') return ']%%';
      return '"' + (t.raw || t.value || t.type) + '"';
    }
    function expectKw(kw) {
      var t = next();
      if (!isKw(t, kw)) throw new AmpError('Expected ' + kw.toUpperCase() + ' but found ' + describe(t), t.line);
      return t;
    }
    function expect(type, label) {
      var t = next();
      if (t.type !== type) throw new AmpError('Expected ' + label + ' but found ' + describe(t), t.line);
      return t;
    }

    function parseStatements(stopKws) {
      var list = [];
      while (true) {
        var t = peek();
        if (t.type === 'EOF') break;
        if (t.type === 'BLOCK_END') { next(); continue; }
        if (t.type === 'KEYWORD' && stopKws && stopKws.indexOf(t.value) !== -1) break;
        list.push(parseStatement());
      }
      return list;
    }

    function parseStatement() {
      var t = peek();
      if (t.type === 'TEXT') { next(); return { type: 'Text', value: t.value }; }
      if (t.type === 'PERSONALIZATION') { next(); return { type: 'Personalization', name: t.value, line: t.line }; }
      if (t.type === 'INLINE_START') {
        next();
        if (peek().type === 'INLINE_END') { next(); return { type: 'Text', value: '' }; }
        var expr = parseExpr();
        expect('INLINE_END', '=%%');
        return { type: 'Output', expr: expr, line: t.line };
      }
      if (t.type === 'KEYWORD') {
        switch (t.value) {
          case 'set': return parseSet();
          case 'var': return parseVar();
          case 'if': return parseIf();
          case 'for': return parseFor();
          case 'endif': case 'elseif': case 'else':
            throw new AmpError(t.value.toUpperCase() + ' without a matching IF', t.line);
          case 'next':
            throw new AmpError('NEXT without a matching FOR', t.line);
        }
      }
      if (t.type === 'IDENT' && tokens[pos + 1] && tokens[pos + 1].type === 'LPAREN') {
        return { type: 'Call', expr: parseExpr(), line: t.line };
      }
      throw new AmpError('Unexpected ' + describe(t) + '. Statements in a code block must start with SET, VAR, IF, FOR or a function call', t.line);
    }

    function parseSet() {
      var kw = next();
      var v = expect('VAR', 'a variable (e.g. @name) after SET');
      if (peek().type !== 'EQUALS') throw new AmpError('Expected = after SET ' + v.raw, peek().line);
      next();
      return { type: 'Set', name: v.value, expr: parseExpr(), line: kw.line };
    }

    function parseVar() {
      var kw = next();
      var names = [expect('VAR', 'a variable after VAR').value];
      while (peek().type === 'COMMA') { next(); names.push(expect('VAR', 'a variable').value); }
      return { type: 'Var', names: names, line: kw.line };
    }

    function parseIf() {
      var kw = next();
      var branches = [];
      var cond = parseExpr();
      expectKw('then');
      branches.push({ cond: cond, body: parseStatements(['elseif', 'else', 'endif']) });
      var elseBody = null;
      while (true) {
        var t = peek();
        if (isKw(t, 'elseif')) {
          next();
          var c2 = parseExpr();
          expectKw('then');
          branches.push({ cond: c2, body: parseStatements(['elseif', 'else', 'endif']) });
        } else if (isKw(t, 'else')) {
          next();
          elseBody = parseStatements(['endif']);
        } else if (isKw(t, 'endif')) {
          next();
          break;
        } else {
          throw new AmpError('IF on line ' + kw.line + ' is missing its ENDIF', kw.line);
        }
      }
      return { type: 'If', branches: branches, elseBody: elseBody, line: kw.line };
    }

    function parseFor() {
      var kw = next();
      var v = expect('VAR', 'a counter variable (e.g. @i) after FOR');
      if (peek().type !== 'EQUALS') throw new AmpError('Expected = after FOR ' + v.raw, peek().line);
      next();
      var from = parseExpr();
      var dirTok = next();
      if (!isKw(dirTok, 'to') && !isKw(dirTok, 'downto')) throw new AmpError('Expected TO or DOWNTO in FOR loop', dirTok.line);
      var to = parseExpr();
      expectKw('do');
      var body = parseStatements(['next']);
      if (!isKw(peek(), 'next')) throw new AmpError('FOR on line ' + kw.line + ' is missing its NEXT', kw.line);
      next();
      if (peek().type === 'VAR') {
        var nv = next();
        if (nv.value !== v.value) throw new AmpError('NEXT ' + nv.raw + ' does not match FOR ' + v.raw, nv.line);
      }
      return { type: 'For', name: v.value, from: from, to: to, down: dirTok.value === 'downto', body: body, line: kw.line };
    }

    // Expressions: OR > AND > NOT > comparison > primary
    function parseExpr() { return parseOr(); }

    function parseOr() {
      var left = parseAnd();
      while (isKw(peek(), 'or')) { var t = next(); left = { type: 'Or', left: left, right: parseAnd(), line: t.line }; }
      return left;
    }
    function parseAnd() {
      var left = parseNot();
      while (isKw(peek(), 'and')) { var t = next(); left = { type: 'And', left: left, right: parseNot(), line: t.line }; }
      return left;
    }
    function parseNot() {
      if (isKw(peek(), 'not')) { var t = next(); return { type: 'Not', expr: parseNot(), line: t.line }; }
      return parseCompare();
    }
    function parseCompare() {
      var left = parsePrimary();
      var t = peek();
      if (t.type === 'OP') { next(); return { type: 'Compare', op: t.value, left: left, right: parsePrimary(), line: t.line }; }
      if (t.type === 'EQUALS') throw new AmpError('Use == to compare values (a single = only works in SET)', t.line);
      return left;
    }
    function parsePrimary() {
      var t = next();
      switch (t.type) {
        case 'STRING': return { type: 'Literal', value: t.value };
        case 'NUMBER': return { type: 'Literal', value: t.value, raw: t.raw };
        case 'VAR': return { type: 'Variable', name: t.value, raw: t.raw, line: t.line };
        case 'ATTR': return { type: 'Attribute', name: t.value, line: t.line };
        case 'LPAREN':
          var e = parseExpr();
          expect('RPAREN', ')');
          return e;
        case 'KEYWORD':
          if (t.value === 'true') return { type: 'Literal', value: true };
          if (t.value === 'false') return { type: 'Literal', value: false };
          break;
        case 'IDENT':
          if (peek().type === 'LPAREN') {
            next();
            var args = [];
            if (peek().type !== 'RPAREN') {
              args.push(parseExpr());
              while (peek().type === 'COMMA') { next(); args.push(parseExpr()); }
            }
            var close = next();
            if (close.type !== 'RPAREN') throw new AmpError('Expected ) or , in call to ' + t.raw + '() but found ' + describe(close), close.line);
            return { type: 'Call', name: t.value, raw: t.raw, args: args, line: t.line };
          }
          return { type: 'Attribute', name: t.raw, line: t.line };
      }
      throw new AmpError('Expected a value but found ' + describe(t), t.line);
    }

    var program = parseStatements(null);
    if (peek().type !== 'EOF') throw new AmpError('Unexpected ' + describe(peek()), peek().line);
    return program;
  }

  // ---------------------------------------------------------------------------
  // Values & conversions
  // ---------------------------------------------------------------------------

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function isRowset(v) { return v && typeof v === 'object' && v.__type === 'rowset'; }
  function isRow(v) { return v && typeof v === 'object' && v.__type === 'row'; }
  function isDate(v) { return v instanceof Date; }

  function pad(n, len) { n = String(n); while (n.length < (len || 2)) n = '0' + n; return n; }

  function formatDefaultDate(d) {
    var h = d.getHours();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear() + ' ' +
      h12 + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + ampm;
  }

  function toStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number') {
      if (!isFinite(v)) return String(v);
      return String(Math.round(v * 1e10) / 1e10);
    }
    if (isDate(v)) return formatDefaultDate(v);
    if (isRowset(v)) return '[Rowset: ' + v.rows.length + ' rows]';
    if (isRow(v)) return '[Row]';
    return String(v);
  }

  function isNumeric(v) {
    if (typeof v === 'number') return isFinite(v);
    if (typeof v !== 'string') return false;
    var s = v.trim();
    return s !== '' && /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s);
  }

  function toNum(v, fn, line) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isNumeric(v)) return parseFloat(String(v).trim());
    throw new AmpError(fn + '(): "' + toStr(v) + '" is not a valid number', line);
  }

  function parseDate(v) {
    if (isDate(v)) return new Date(v.getTime());
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return null;
    var s = String(v).trim();
    var m;
    // M/D/YYYY [h:mm[:ss] [AM|PM]]
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(s))) {
      var h = m[4] ? parseInt(m[4], 10) : 0;
      if (m[7]) { var pm = m[7].toLowerCase() === 'pm'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
      return new Date(+m[3], +m[1] - 1, +m[2], h, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    }
    // YYYY-MM-DD[THH:mm[:ss]]
    if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s))) {
      if (m[7]) return new Date(s);
      return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    }
    return null;
  }

  function toDate(v, fn, line) {
    var d = parseDate(v);
    if (!d || isNaN(d.getTime())) throw new AmpError(fn + '(): "' + toStr(v) + '" is not a valid date', line);
    return d;
  }

  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
    if (typeof v === 'number') return v !== 0;
    return false;
  }

  function compare(a, b, op) {
    var x, y;
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      x = toStr(a).toLowerCase(); y = toStr(b).toLowerCase();
    } else if (isNumeric(a) && isNumeric(b)) {
      x = parseFloat(a); y = parseFloat(b);
    } else if ((isDate(a) || isDate(b)) && parseDate(a) && parseDate(b)) {
      x = parseDate(a).getTime(); y = parseDate(b).getTime();
    } else {
      x = toStr(a).toLowerCase(); y = toStr(b).toLowerCase();
    }
    switch (op) {
      case '==': return x === y;
      case '!=': return x !== y;
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
    }
    return false;
  }

  function eqCI(a, b) { return toStr(a).toLowerCase() === toStr(b).toLowerCase(); }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function formatDateTokens(d, fmt) {
    var h = d.getHours();
    var map = {
      yyyy: d.getFullYear(), yy: pad(d.getFullYear() % 100),
      MMMM: MONTHS[d.getMonth()], MMM: MONTHS[d.getMonth()].slice(0, 3), MM: pad(d.getMonth() + 1), M: d.getMonth() + 1,
      dddd: DAYS[d.getDay()], ddd: DAYS[d.getDay()].slice(0, 3), dd: pad(d.getDate()), d: d.getDate(),
      HH: pad(h), H: h, hh: pad(h % 12 === 0 ? 12 : h % 12), h: h % 12 === 0 ? 12 : h % 12,
      mm: pad(d.getMinutes()), m: d.getMinutes(), ss: pad(d.getSeconds()), s: d.getSeconds(),
      tt: h >= 12 ? 'PM' : 'AM', t: h >= 12 ? 'P' : 'A'
    };
    return fmt.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t|'[^']*'/g, function (tok) {
      if (tok[0] === "'") return tok.slice(1, -1);
      return String(map[tok]);
    });
  }

  function formatDateNamed(d, fmt) {
    var f = String(fmt || '').trim();
    switch (f.toLowerCase()) {
      case '': return '';
      case 's': return formatDateTokens(d, "yyyy-MM-dd'T'HH:mm:ss");
      case 'iso': return formatDateTokens(d, "yyyy-MM-dd'T'HH:mm:ss");
      case 'l': return formatDateTokens(d, 'M/d/yyyy');
      case 'short': return formatDateTokens(d, 'M/d/yyyy');
      case 'long': return formatDateTokens(d, 'dddd, MMMM d, yyyy');
      case 'shorttime': return formatDateTokens(d, 'h:mm tt');
      case 'longtime': return formatDateTokens(d, 'h:mm:ss tt');
    }
    return formatDateTokens(d, f);
  }

  var CURRENCY_BY_CULTURE = {
    'en-us': 'USD', 'en-au': 'AUD', 'en-gb': 'GBP', 'en-ca': 'CAD', 'en-nz': 'NZD', 'en-in': 'INR',
    'en-ie': 'EUR', 'de-de': 'EUR', 'fr-fr': 'EUR', 'es-es': 'EUR', 'it-it': 'EUR', 'nl-nl': 'EUR',
    'ja-jp': 'JPY', 'zh-cn': 'CNY', 'ur-pk': 'PKR', 'en-pk': 'PKR', 'ms-my': 'MYR', 'id-id': 'IDR', 'en-sg': 'SGD'
  };

  function formatNumberSpec(n, spec, culture) {
    var loc = culture || 'en-US';
    var m = /^([NnCcPpFfDdEe])(\d*)$/.exec(String(spec).trim());
    if (m) {
      var kind = m[1].toUpperCase();
      var digits = m[2] === '' ? null : parseInt(m[2], 10);
      if (kind === 'N') return n.toLocaleString(loc, { minimumFractionDigits: digits === null ? 2 : digits, maximumFractionDigits: digits === null ? 2 : digits });
      if (kind === 'F') return n.toFixed(digits === null ? 2 : digits);
      if (kind === 'D') { var s = String(Math.trunc(n)); return digits ? (n < 0 ? '-' : '') + pad(s.replace('-', ''), digits) : s; }
      if (kind === 'P') return (n * 100).toLocaleString(loc, { minimumFractionDigits: digits === null ? 2 : digits, maximumFractionDigits: digits === null ? 2 : digits }) + '%';
      if (kind === 'E') return n.toExponential(digits === null ? 6 : digits).toUpperCase();
      if (kind === 'C') return currency(n, loc, digits === null ? 2 : digits);
    }
    // Custom pattern like "#,##0.00" or "0.0"
    var pattern = String(spec);
    var dot = pattern.indexOf('.');
    var decimals = dot < 0 ? 0 : (pattern.slice(dot + 1).match(/[0#]/g) || []).length;
    var grouping = pattern.indexOf(',') !== -1 && (dot < 0 || pattern.indexOf(',') < dot);
    return n.toLocaleString(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping });
  }

  function currency(n, culture, decimals, symbol) {
    var loc = culture || 'en-US';
    var code = has(CURRENCY_BY_CULTURE, loc.toLowerCase()) ? CURRENCY_BY_CULTURE[loc.toLowerCase()] : 'USD';
    var out;
    try {
      out = n.toLocaleString(loc, { style: 'currency', currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    } catch (e) {
      out = '$' + n.toFixed(decimals);
    }
    if (symbol) out = out.replace(/[^\d.,\s-]+/, symbol);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Small encoders
  // ---------------------------------------------------------------------------

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00); }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function base64Encode(str) {
    var b = utf8Bytes(str), out = '';
    for (var i = 0; i < b.length; i += 3) {
      var n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
    }
    return out;
  }

  function base64Decode(str, fn, line) {
    var s = String(str).replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 === 1) throw new AmpError(fn + '(): input is not valid Base64', line);
    var bytes = [];
    for (var i = 0; i < s.length; i += 4) {
      var n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63);
      bytes.push((n >> 16) & 255);
      if (s[i + 2] && s[i + 2] !== '=') bytes.push((n >> 8) & 255);
      if (s[i + 3] && s[i + 3] !== '=') bytes.push(n & 255);
    }
    var out = '';
    for (var j = 0; j < bytes.length;) {
      var c = bytes[j++];
      if (c < 0x80) out += String.fromCharCode(c);
      else if (c < 0xe0) out += String.fromCharCode(((c & 31) << 6) | (bytes[j++] & 63));
      else if (c < 0xf0) out += String.fromCharCode(((c & 15) << 12) | ((bytes[j++] & 63) << 6) | (bytes[j++] & 63));
      else {
        var cp = ((c & 7) << 18) | ((bytes[j++] & 63) << 12) | ((bytes[j++] & 63) << 6) | (bytes[j++] & 63);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
      }
    }
    return out;
  }

  // SHA-256 (sync, for SHA256())
  function sha256(str) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bytes = utf8Bytes(str);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s = 7; s >= 0; s--) bytes.push(s > 3 ? 0 : (bitLen >>> (s * 8)) & 255);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    var W = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var t = 0; t < 16; t++) W[t] = (bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) | (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3];
      for (t = 16; t < 64; t++) {
        var s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
        var s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + W[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  // ---------------------------------------------------------------------------
  // Interpreter
  // ---------------------------------------------------------------------------

  var SYSTEM_STRINGS = {
    view_email_url: '#view-email', unsub_center_url: '#unsubscribe-center', profile_center_url: '#profile-center',
    subscription_center_url: '#subscription-center', forward_url: '#forward', member_busname: 'Your Company',
    member_addr: '123 Example Street', member_city: 'Sydney', member_state: 'NSW', member_postalcode: '2000',
    member_country: 'Australia', emailname_: 'Playground email', jobid: '12345', _messagecontext: 'PREVIEW',
    _subscriberkey: null, emailaddr: null, subscriberid: '1', listid: '1'
  };

  function render(template, options) {
    options = options || {};
    var ctx = {
      vars: Object.create(null),
      subscriber: options.subscriber || {},
      dataExtensions: cloneDEs(options.dataExtensions || {}),
      contentBlocks: options.contentBlocks || {},
      params: options.requestParameters || {},
      now: options.now ? new Date(options.now) : null,
      warnings: [],
      log: [],
      depth: 0,
      redirect: null,
      seenWarnings: Object.create(null)
    };

    var result = { html: '', errors: [], warnings: ctx.warnings, log: ctx.log, raised: false, redirect: null, dataExtensions: ctx.dataExtensions };
    try {
      result.html = renderIn(String(template || ''), ctx);
    } catch (e) {
      if (e instanceof RaiseError) {
        result.raised = true;
        result.errors.push({ message: 'RaiseError: ' + e.message + ' (in SFMC the email would not be sent to this subscriber)', line: null });
      } else if (e instanceof AmpError) {
        result.errors.push({ message: e.message, line: e.line });
      } else {
        result.errors.push({ message: 'Internal error: ' + (e && e.message ? e.message : String(e)), line: null });
      }
    }
    result.redirect = ctx.redirect;
    return result;
  }

  function cloneDEs(des) {
    var out = {};
    Object.keys(des).forEach(function (name) {
      var rows = Array.isArray(des[name]) ? des[name] : [];
      out[name] = rows.map(function (r) { var c = {}; Object.keys(r || {}).forEach(function (k) { c[k] = r[k]; }); return c; });
    });
    return out;
  }

  function renderIn(template, ctx) {
    if (++ctx.depth > MAX_DEPTH) throw new AmpError('TreatAsContent / content blocks are nested too deeply', null);
    try {
      var program = parse(lex(template));
      var out = [];
      execBlock(program, ctx, out);
      return out.join('');
    } finally {
      ctx.depth--;
    }
  }

  function warn(ctx, msg) {
    if (ctx.seenWarnings[msg]) return;
    ctx.seenWarnings[msg] = true;
    ctx.warnings.push(msg);
  }

  function execBlock(stmts, ctx, out) {
    for (var i = 0; i < stmts.length; i++) exec(stmts[i], ctx, out);
  }

  function exec(s, ctx, out) {
    switch (s.type) {
      case 'Text': out.push(s.value); return;
      case 'Personalization': out.push(toStr(personalization(s.name, ctx))); return;
      case 'Output': out.push(toStr(evaluate(s.expr, ctx, out))); return;
      case 'Set': ctx.vars[s.name] = evaluate(s.expr, ctx, out); return;
      case 'Var':
        s.names.forEach(function (n) { if (!(n in ctx.vars)) ctx.vars[n] = null; });
        return;
      case 'Call': evaluate(s.expr, ctx, out); return;
      case 'If':
        for (var b = 0; b < s.branches.length; b++) {
          if (truthy(evaluate(s.branches[b].cond, ctx, out))) { execBlock(s.branches[b].body, ctx, out); return; }
        }
        if (s.elseBody) execBlock(s.elseBody, ctx, out);
        return;
      case 'For':
        var from = toNum(evaluate(s.from, ctx, out), 'FOR', s.line);
        var to = toNum(evaluate(s.to, ctx, out), 'FOR', s.line);
        var count = 0;
        for (var n = from; s.down ? n >= to : n <= to; n += s.down ? -1 : 1) {
          if (++count > MAX_LOOP) throw new AmpError('FOR loop ran more than ' + MAX_LOOP + ' times', s.line);
          ctx.vars[s.name] = n;
          execBlock(s.body, ctx, out);
        }
        return;
    }
  }

  function findKey(obj, name) {
    var low = String(name).toLowerCase();
    var keys = Object.keys(obj || {});
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === low) return keys[i];
    return null;
  }

  function attributeValue(name, ctx) {
    var key = findKey(ctx.subscriber, name);
    if (key !== null) return ctx.subscriber[key];
    var low = String(name).toLowerCase();
    if (low === 'emailaddr' || low === 'emailaddress' || low === 'email address') {
      var ek = findKey(ctx.subscriber, 'EmailAddress') || findKey(ctx.subscriber, 'Email Address') || findKey(ctx.subscriber, 'emailaddr') || findKey(ctx.subscriber, 'Email');
      if (ek !== null) return ctx.subscriber[ek];
    }
    if (low === '_subscriberkey' || low === 'subscriberkey') {
      var sk = findKey(ctx.subscriber, 'SubscriberKey') || findKey(ctx.subscriber, '_subscriberkey');
      if (sk !== null) return ctx.subscriber[sk];
    }
    if (has(SYSTEM_STRINGS, low) && SYSTEM_STRINGS[low] !== null) return SYSTEM_STRINGS[low];
    return undefined;
  }

  function personalization(name, ctx) {
    var v = attributeValue(name, ctx);
    if (v === undefined) {
      warn(ctx, 'Personalization string %%' + name + '%% has no value in the subscriber data');
      return '';
    }
    return v;
  }

  function evaluate(e, ctx, out) {
    switch (e.type) {
      case 'Literal': return e.value;
      case 'Variable':
        if (!(e.name in ctx.vars)) {
          warn(ctx, 'Variable ' + e.raw + ' is used before it is SET (treated as empty)');
          return null;
        }
        return ctx.vars[e.name];
      case 'Attribute':
        var v = attributeValue(e.name, ctx);
        if (v === undefined) {
          warn(ctx, 'Attribute "' + e.name + '" has no value in the subscriber data');
          return '';
        }
        return v;
      case 'Not': return !truthy(evaluate(e.expr, ctx, out));
      case 'And': return truthy(evaluate(e.left, ctx, out)) && truthy(evaluate(e.right, ctx, out));
      case 'Or': return truthy(evaluate(e.left, ctx, out)) || truthy(evaluate(e.right, ctx, out));
      case 'Compare': return compare(evaluate(e.left, ctx, out), evaluate(e.right, ctx, out), e.op);
      case 'Call': return callFunction(e, ctx, out);
    }
    throw new AmpError('Cannot evaluate expression', e.line);
  }

  // ---------------------------------------------------------------------------
  // Functions
  // ---------------------------------------------------------------------------

  function callFunction(e, ctx, out) {
    var name = e.name;
    var line = e.line;

    // Lazy-evaluated functions
    if (name === 'iif') {
      argCount(e, 3, 3);
      return truthy(evaluate(e.args[0], ctx, out)) ? evaluate(e.args[1], ctx, out) : evaluate(e.args[2], ctx, out);
    }

    var fn = has(FUNCTIONS, name) ? FUNCTIONS[name] : null;
    if (!fn) {
      if (has(UNSUPPORTED, name)) throw new AmpError(e.raw + '() ' + UNSUPPORTED[name], line);
      throw new AmpError('Unknown function ' + e.raw + '()', line);
    }
    argCount(e, fn.min, fn.max);
    var args = e.args.map(function (a) { return evaluate(a, ctx, out); });
    return fn.run(args, { ctx: ctx, out: out, line: line, name: e.raw });
  }

  function argCount(e, min, max) {
    var n = e.args.length;
    if (n < min || (max !== null && max !== undefined && n > max)) {
      var expected = min === max ? String(min) : (max === null || max === undefined ? 'at least ' + min : min + ' to ' + max);
      throw new AmpError(e.raw + '() expects ' + expected + ' argument' + (expected === '1' ? '' : 's') + ' but got ' + n, e.line);
    }
  }

  function getDE(c, name) {
    var key = findKey(c.ctx.dataExtensions, name);
    if (key === null) throw new AmpError(c.name + '(): data extension "' + toStr(name) + '" not found. Add it in the Data Extensions panel', c.line);
    return c.ctx.dataExtensions[key];
  }

  function matchRows(rows, pairs) {
    return rows.filter(function (row) {
      for (var i = 0; i < pairs.length; i += 2) {
        var k = findKey(row, pairs[i]);
        if (k === null || !eqCI(row[k], pairs[i + 1])) return false;
      }
      return true;
    });
  }

  function pairsFrom(args, start, c) {
    var pairs = args.slice(start);
    if (pairs.length % 2 !== 0) throw new AmpError(c.name + '(): field names and values must come in pairs', c.line);
    return pairs;
  }

  function makeRowset(rows) {
    return { __type: 'rowset', rows: rows.map(function (r) { return { __type: 'row', fields: r }; }) };
  }

  function now(c) { return c.ctx.now ? new Date(c.ctx.now.getTime()) : new Date(); }

  function dateUnit(u, c) {
    var s = toStr(u).trim().toLowerCase();
    var map = { y: 'Y', year: 'Y', yy: 'Y', yyyy: 'Y', m: 'M', month: 'M', mm: 'M', d: 'D', day: 'D', dd: 'D', h: 'H', hour: 'H', hh: 'H', mi: 'MI', minute: 'MI', n: 'MI' };
    if (!has(map, s)) throw new AmpError(c.name + '(): unknown date part "' + toStr(u) + '". Use Y, M, D, H or MI', c.line);
    return map[s];
  }

  function writeDE(kind, args, c) {
    var rows = getDE(c, args[0]);
    var keyCount = 0, rest;
    if (kind === 'insert') {
      rest = pairsFrom(args, 1, c);
    } else if (kind === 'delete') {
      rest = pairsFrom(args, 1, c);
      var before = rows.length;
      var keep = rows.filter(function (r) { return matchRows([r], rest).length === 0; });
      rows.length = 0;
      Array.prototype.push.apply(rows, keep);
      c.ctx.log.push(c.name + ': deleted ' + (before - keep.length) + ' row(s) from ' + toStr(args[0]));
      return before - keep.length;
    } else {
      keyCount = toNum(args[1], c.name, c.line);
      rest = pairsFrom(args, 2, c);
    }
    var keys = rest.slice(0, keyCount * 2);
    var values = rest.slice(keyCount * 2);
    var targets = keyCount ? matchRows(rows, keys) : [];
    var row;

    if (kind === 'insert' || (kind === 'upsert' && !targets.length)) {
      row = {};
      for (var i = 0; i < keys.length; i += 2) row[toStr(keys[i])] = keys[i + 1];
      for (var j = 0; j < values.length; j += 2) row[toStr(values[j])] = values[j + 1];
      rows.push(row);
      c.ctx.log.push(c.name + ': inserted 1 row into ' + toStr(args[0]));
      return 1;
    }
    targets.forEach(function (r) {
      for (var k = 0; k < values.length; k += 2) {
        var existing = findKey(r, values[k]);
        r[existing === null ? toStr(values[k]) : existing] = values[k + 1];
      }
    });
    c.ctx.log.push(c.name + ': updated ' + targets.length + ' row(s) in ' + toStr(args[0]));
    return targets.length;
  }

  function contentBlock(kind, args, c) {
    var key = findKey(c.ctx.contentBlocks, args[0]);
    if (key === null) {
      warn(c.ctx, c.name + '("' + toStr(args[0]) + '"): content block not found — add it to Content Blocks to preview it');
      return '<!-- ' + c.name + '(' + toStr(args[0]) + ') -->';
    }
    return renderIn(String(c.ctx.contentBlocks[key]), c.ctx);
  }

  function F(min, max, run) { return { min: min, max: max, run: run }; }

  var FUNCTIONS = {
    // Output
    output: F(1, 1, function (a, c) { c.out.push(toStr(a[0])); return ''; }),
    outputline: F(1, 1, function (a, c) { c.out.push(toStr(a[0]) + '\n'); return ''; }),
    v: F(1, 1, function (a) { return a[0]; }),

    // Strings
    concat: F(1, null, function (a) { return a.map(toStr).join(''); }),
    length: F(1, 1, function (a) { return toStr(a[0]).length; }),
    substring: F(2, 3, function (a, c) {
      var s = toStr(a[0]);
      var start = toNum(a[1], c.name, c.line);
      if (start < 1) throw new AmpError('Substring(): start position must be 1 or more (AMPscript counts from 1)', c.line);
      return a.length > 2 ? s.substr(start - 1, toNum(a[2], c.name, c.line)) : s.substr(start - 1);
    }),
    indexof: F(2, 2, function (a) { return toStr(a[0]).indexOf(toStr(a[1])) + 1; }),
    uppercase: F(1, 1, function (a) { return toStr(a[0]).toUpperCase(); }),
    lowercase: F(1, 1, function (a) { return toStr(a[0]).toLowerCase(); }),
    propercase: F(1, 1, function (a) {
      return toStr(a[0]).toLowerCase().replace(/(^|[\s\-'])([a-z])/g, function (m, p, ch) { return p + ch.toUpperCase(); });
    }),
    trim: F(1, 1, function (a) { return toStr(a[0]).trim(); }),
    replace: F(3, 3, function (a) { var f = toStr(a[1]); return f ? toStr(a[0]).split(f).join(toStr(a[2])) : toStr(a[0]); }),
    replacelist: F(3, null, function (a) {
      var s = toStr(a[0]), r = toStr(a[1]);
      for (var i = 2; i < a.length; i++) { var f = toStr(a[i]); if (f) s = s.split(f).join(r); }
      return s;
    }),
    char: F(1, 2, function (a, c) {
      var ch = String.fromCharCode(toNum(a[0], c.name, c.line));
      var times = a.length > 1 ? toNum(a[1], c.name, c.line) : 1;
      return new Array(Math.max(0, times) + 1).join(ch);
    }),
    stringtohex: F(1, 1, function (a) { return utf8Bytes(toStr(a[0])).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }),
    regexmatch: F(3, 4, function (a, c) {
      var flags = '';
      for (var i = 3; i < a.length; i++) if (/ignorecase/i.test(toStr(a[i]))) flags += 'i';
      var re;
      try { re = new RegExp(toStr(a[1]), flags); } catch (e) { throw new AmpError('RegExMatch(): invalid pattern', c.line); }
      var m = re.exec(toStr(a[0]));
      if (!m) return '';
      var g = a[2];
      return isNumeric(g) ? (m[parseInt(g, 10)] || '') : ((m.groups && m.groups[toStr(g)]) || '');
    }),

    // Validation
    empty: F(1, 1, function (a) { return a[0] === null || a[0] === undefined || toStr(a[0]) === '' && !isRowset(a[0]); }),
    isnull: F(1, 1, function (a) { return a[0] === null || a[0] === undefined; }),
    isemailaddress: F(1, 1, function (a) { return /^[^\s@"]+@[^\s@]+\.[^\s@]{2,}$/.test(toStr(a[0]).trim()); }),
    isphonenumber: F(1, 1, function (a) { var d = toStr(a[0]).replace(/[\s().+-]/g, ''); return /^\d{10,11}$/.test(d); }),

    // Maths
    add: F(2, 2, function (a, c) { return toNum(a[0], c.name, c.line) + toNum(a[1], c.name, c.line); }),
    subtract: F(2, 2, function (a, c) { return toNum(a[0], c.name, c.line) - toNum(a[1], c.name, c.line); }),
    multiply: F(2, 2, function (a, c) { return toNum(a[0], c.name, c.line) * toNum(a[1], c.name, c.line); }),
    divide: F(2, 2, function (a, c) {
      var d = toNum(a[1], c.name, c.line);
      if (d === 0) throw new AmpError('Divide(): cannot divide by zero', c.line);
      return toNum(a[0], c.name, c.line) / d;
    }),
    mod: F(2, 2, function (a, c) {
      var d = toNum(a[1], c.name, c.line);
      if (d === 0) throw new AmpError('Mod(): cannot divide by zero', c.line);
      return toNum(a[0], c.name, c.line) % d;
    }),
    random: F(2, 2, function (a, c) {
      var lo = Math.ceil(toNum(a[0], c.name, c.line)), hi = Math.floor(toNum(a[1], c.name, c.line));
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    }),

    // Formatting
    format: F(2, 4, function (a, c) {
      var fmt = toStr(a[1]);
      var d = isNumeric(a[0]) ? null : parseDate(a[0]);
      if (d) return formatDateNamed(d, fmt);
      return formatNumberSpec(toNum(a[0], c.name, c.line), fmt, a.length > 3 ? toStr(a[3]) : null);
    }),
    formatnumber: F(2, 3, function (a, c) { return formatNumberSpec(toNum(a[0], c.name, c.line), toStr(a[1]), a.length > 2 ? toStr(a[2]) : null); }),
    formatcurrency: F(2, 4, function (a, c) {
      var n = toNum(a[0], c.name, c.line);
      var culture = toStr(a[1]) || 'en-US';
      var decimals = a.length > 2 && toStr(a[2]) !== '' ? toNum(a[2], c.name, c.line) : 2;
      return currency(n, culture, decimals, a.length > 3 ? toStr(a[3]) : null);
    }),

    // Dates
    now: F(0, 1, function (a, c) { return now(c); }),
    systemdatetolocaldate: F(1, 1, function (a, c) { return toDate(a[0], c.name, c.line); }),
    localdatetosystemdate: F(1, 1, function (a, c) { return toDate(a[0], c.name, c.line); }),
    stringtodate: F(1, 2, function (a, c) { return toDate(a[0], c.name, c.line); }),
    dateparse: F(1, 2, function (a, c) { return toDate(a[0], c.name, c.line); }),
    formatdate: F(2, 4, function (a, c) {
      var d = toDate(a[0], c.name, c.line);
      var out = formatDateNamed(d, toStr(a[1]));
      if (a.length > 2 && toStr(a[2])) out = (out ? out + ' ' : '') + formatDateNamed(d, toStr(a[2]));
      return out;
    }),
    dateadd: F(3, 3, function (a, c) {
      var d = toDate(a[0], c.name, c.line);
      var n = toNum(a[1], c.name, c.line);
      switch (dateUnit(a[2], c)) {
        case 'Y': d.setFullYear(d.getFullYear() + n); break;
        case 'M': d.setMonth(d.getMonth() + n); break;
        case 'D': d.setDate(d.getDate() + n); break;
        case 'H': d.setHours(d.getHours() + n); break;
        case 'MI': d.setMinutes(d.getMinutes() + n); break;
      }
      return d;
    }),
    datediff: F(3, 3, function (a, c) {
      var d1 = toDate(a[0], c.name, c.line), d2 = toDate(a[1], c.name, c.line);
      switch (dateUnit(a[2], c)) {
        case 'Y': return d2.getFullYear() - d1.getFullYear();
        case 'M': return (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth();
        case 'D': return Math.round((Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate()) - Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate())) / 86400000);
        case 'H': return Math.trunc((d2 - d1) / 3600000);
        case 'MI': return Math.trunc((d2 - d1) / 60000);
      }
    }),
    datepart: F(2, 2, function (a, c) {
      var d = toDate(a[0], c.name, c.line);
      var p = toStr(a[1]).trim().toLowerCase();
      if (p === 'monthname') return MONTHS[d.getMonth()];
      if (p === 'dayname' || p === 'weekday') return DAYS[d.getDay()];
      switch (dateUnit(a[1], c)) {
        case 'Y': return d.getFullYear();
        case 'M': return d.getMonth() + 1;
        case 'D': return d.getDate();
        case 'H': return d.getHours();
        case 'MI': return d.getMinutes();
      }
    }),

    // Subscriber
    attributevalue: F(1, 1, function (a, c) { var v = attributeValue(toStr(a[0]), c.ctx); return v === undefined ? '' : v; }),

    // Data extensions
    lookup: F(4, null, function (a, c) {
      var rows = matchRows(getDE(c, a[0]), pairsFrom(a, 2, c));
      if (!rows.length) return '';
      var k = findKey(rows[0], a[1]);
      if (k === null) throw new AmpError('Lookup(): field "' + toStr(a[1]) + '" not found in ' + toStr(a[0]), c.line);
      return rows[0][k];
    }),
    lookuprows: F(3, null, function (a, c) { return makeRowset(matchRows(getDE(c, a[0]), pairsFrom(a, 1, c))); }),
    lookuporderedrows: F(5, null, function (a, c) {
      var rows = matchRows(getDE(c, a[0]), pairsFrom(a, 3, c)).slice();
      var order = toStr(a[2]).split(',').map(function (part) {
        var bits = part.trim().split(/\s+/);
        return { field: bits[0], desc: /^desc$/i.test(bits[1] || '') };
      }).filter(function (o) { return o.field; });
      rows.sort(function (x, y) {
        for (var i = 0; i < order.length; i++) {
          var kx = findKey(x, order[i].field), ky = findKey(y, order[i].field);
          var vx = kx === null ? '' : x[kx], vy = ky === null ? '' : y[ky];
          if (compare(vx, vy, '==')) continue;
          var lt = compare(vx, vy, '<');
          return (lt ? -1 : 1) * (order[i].desc ? -1 : 1);
        }
        return 0;
      });
      var count = toNum(a[1], c.name, c.line);
      return makeRowset(count > 0 ? rows.slice(0, count) : rows);
    }),
    rowcount: F(1, 1, function (a, c) {
      if (!isRowset(a[0])) throw new AmpError('RowCount(): argument is not a rowset', c.line);
      return a[0].rows.length;
    }),
    row: F(2, 2, function (a, c) {
      if (!isRowset(a[0])) throw new AmpError('Row(): first argument is not a rowset', c.line);
      var i = toNum(a[1], c.name, c.line);
      if (i < 1 || i > a[0].rows.length) throw new AmpError('Row(): row ' + i + ' does not exist (rowset has ' + a[0].rows.length + ' rows)', c.line);
      return a[0].rows[i - 1];
    }),
    field: F(2, 3, function (a, c) {
      if (!isRow(a[0])) throw new AmpError('Field(): first argument is not a row. Use Row(@rows, @i) first', c.line);
      var fields = a[0].fields;
      var k = isNumeric(a[1]) && !findKey(fields, a[1]) ? Object.keys(fields)[toNum(a[1], c.name, c.line) - 1] : findKey(fields, a[1]);
      if (k === null || k === undefined) {
        if (a.length > 2 && !truthy(a[2])) return '';
        throw new AmpError('Field(): field "' + toStr(a[1]) + '" not found in row', c.line);
      }
      return fields[k];
    }),
    buildrowsetfromstring: F(2, 2, function (a) {
      var s = toStr(a[0]);
      if (s === '') return makeRowset([]);
      return makeRowset(s.split(toStr(a[1]) || ',').map(function (v) { return { 1: v }; }));
    }),
    buildrowsetfromjson: F(2, 3, function (a, c) {
      var data;
      try { data = JSON.parse(toStr(a[0])); } catch (e) { throw new AmpError('BuildRowsetFromJSON(): invalid JSON', c.line); }
      var path = toStr(a[1]).replace(/^\$\.?/, '');
      var node = data;
      path.split('.').filter(Boolean).forEach(function (p) {
        var m = /^([^\[]*)(\[\*\])?$/.exec(p);
        if (node && m[1]) node = node[m[1]];
      });
      var list = Array.isArray(node) ? node : node ? [node] : [];
      return makeRowset(list.map(function (item) { return typeof item === 'object' && item !== null ? item : { 1: item }; }));
    }),
    dataextensionrowcount: F(1, 1, function (a, c) { return getDE(c, a[0]).length; }),
    insertde: F(3, null, function (a, c) { writeDE('insert', a, c); return ''; }),
    upsertde: F(4, null, function (a, c) { writeDE('upsert', a, c); return ''; }),
    updatede: F(4, null, function (a, c) { writeDE('update', a, c); return ''; }),
    deletede: F(3, null, function (a, c) { writeDE('delete', a, c); return ''; }),
    insertdata: F(3, null, function (a, c) { return writeDE('insert', a, c); }),
    upsertdata: F(4, null, function (a, c) { return writeDE('upsert', a, c); }),
    updatedata: F(4, null, function (a, c) { return writeDE('update', a, c); }),
    deletedata: F(3, null, function (a, c) { return writeDE('delete', a, c); }),

    // Content
    treatascontent: F(1, 1, function (a, c) { return renderIn(toStr(a[0]), c.ctx); }),
    contentblockbykey: F(1, 3, function (a, c) { return contentBlock('key', a, c); }),
    contentblockbyname: F(1, 3, function (a, c) { return contentBlock('name', a, c); }),
    contentblockbyid: F(1, 3, function (a, c) { return contentBlock('id', a, c); }),
    redirectto: F(1, 1, function (a) { return toStr(a[0]); }),
    redirect: F(1, 2, function (a, c) { c.ctx.redirect = toStr(a[0]); c.ctx.log.push('Redirect to ' + toStr(a[0])); return ''; }),
    raiseerror: F(1, 5, function (a, c) {
      if (a.length > 1 && truthy(a[1])) {
        warn(c.ctx, 'RaiseError("' + toStr(a[0]) + '") with skip = true: this subscriber would be skipped in a send');
      }
      throw new RaiseError(toStr(a[0]));
    }),

    // Encoding & utilities
    base64encode: F(1, 2, function (a) { return base64Encode(toStr(a[0])); }),
    base64decode: F(1, 3, function (a, c) { return base64Decode(toStr(a[0]), c.name, c.line); }),
    urlencode: F(1, 3, function (a) { return encodeURI(toStr(a[0])); }),
    escapedatastring: F(1, 1, function (a) { return encodeURIComponent(toStr(a[0])); }),
    sha256: F(1, 2, function (a) { return sha256(toStr(a[0])); }),
    guid: F(0, 0, function () {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
        var r = Math.random() * 16 | 0;
        return (ch === 'x' ? r : (r & 3) | 8).toString(16);
      });
    }),
    requestparameter: F(1, 1, function (a, c) {
      var k = findKey(c.ctx.params, a[0]);
      return k === null ? '' : c.ctx.params[k];
    }),
    querystringparameter: F(1, 1, function (a, c) { return FUNCTIONS.requestparameter.run(a, c); }),
    cloudpagesurl: F(1, null, function (a) { return 'https://cloud.example.com/page?id=' + encodeURIComponent(toStr(a[0])); })
  };

  var NETWORK = 'is not available in the playground because it calls an external service. It works in SFMC.';
  var UNSUPPORTED = {
    httpget: NETWORK, httppost: NETWORK, httppost2: NETWORK, httpget2: NETWORK,
    createsalesforceobject: NETWORK, retrievesalesforceobjects: NETWORK, updatesingleSalesforceobject: NETWORK,
    updatesinglesalesforceobject: NETWORK, invokecreate: NETWORK, invokeretrieve: NETWORK, invokeupdate: NETWORK,
    createobject: NETWORK, encryptsymmetric: 'needs SFMC key management and is not available in the playground.',
    decryptsymmetric: 'needs SFMC key management and is not available in the playground.',
    md5: 'is not available in the playground yet. SHA256() is supported.',
    sha1: 'is not available in the playground yet. SHA256() is supported.'
  };

  // Names of supported functions, for docs and editor autocomplete
  var NAMES = {
    Output: 1, OutputLine: 1, V: 1, Concat: 1, Length: 1, Substring: 1, IndexOf: 1, Uppercase: 1, Lowercase: 1,
    ProperCase: 1, Trim: 1, Replace: 1, ReplaceList: 1, Char: 1, StringToHex: 1, RegExMatch: 1, Empty: 1, IsNull: 1,
    IsEmailAddress: 1, IsPhoneNumber: 1, IIF: 1, Add: 1, Subtract: 1, Multiply: 1, Divide: 1, Mod: 1, Random: 1,
    Format: 1, FormatNumber: 1, FormatCurrency: 1, Now: 1, SystemDateToLocalDate: 1, LocalDateToSystemDate: 1,
    StringToDate: 1, DateParse: 1, FormatDate: 1, DateAdd: 1, DateDiff: 1, DatePart: 1, AttributeValue: 1,
    Lookup: 1, LookupRows: 1, LookupOrderedRows: 1, RowCount: 1, Row: 1, Field: 1, BuildRowsetFromString: 1,
    BuildRowsetFromJSON: 1, DataExtensionRowCount: 1, InsertDE: 1, UpsertDE: 1, UpdateDE: 1, DeleteDE: 1,
    InsertData: 1, UpsertData: 1, UpdateData: 1, DeleteData: 1, TreatAsContent: 1, ContentBlockByKey: 1,
    ContentBlockByName: 1, ContentBlockById: 1, RedirectTo: 1, Redirect: 1, RaiseError: 1, Base64Encode: 1,
    Base64Decode: 1, URLEncode: 1, EscapeDataString: 1, SHA256: 1, GUID: 1, RequestParameter: 1,
    QueryStringParameter: 1, CloudPagesURL: 1
  };

  return {
    render: render,
    version: '0.1.0',
    functions: Object.keys(NAMES)
  };
});
