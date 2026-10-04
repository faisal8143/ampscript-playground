'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../src/ampscript.js');

const NOW = '2026-10-04T09:30:00';
const run = (tpl, opts = {}) => render(tpl, Object.assign({ now: NOW }, opts));
const html = (tpl, opts) => {
  const r = run(tpl, opts);
  assert.deepEqual(r.errors, [], 'unexpected errors: ' + JSON.stringify(r.errors));
  return r.html;
};
const error = (tpl, opts) => {
  const r = run(tpl, opts);
  assert.ok(r.errors.length, 'expected an error');
  return r.errors[0];
};

// --- Syntax ---------------------------------------------------------------------

test('plain HTML passes through untouched', () => {
  assert.equal(html('<p>50% off — 100%% real</p>'), '<p>50% off — 100%% real</p>');
});

test('SET and inline output', () => {
  assert.equal(html('%%[ SET @a = "Hello" ]%%%%=v(@a)=%% world'), 'Hello world');
});

test('keywords and function names are case-insensitive', () => {
  assert.equal(html('%%[ set @A = concat("a", "b") ]%%%%=V(@a)=%%'), 'ab');
});

test('both quote styles and doubled-quote escapes', () => {
  assert.equal(html(`%%=Concat('It''s', " ", "a ""test""")=%%`), `It's a "test"`);
});

test('comments are ignored', () => {
  assert.equal(html('%%[ /* comment */ SET @a = 1 /* another\nline */ ]%%%%=v(@a)=%%'), '1');
});

test('IF / ELSEIF / ELSE wrapping HTML', () => {
  const tpl = '%%[ IF @n == 1 THEN ]%%one%%[ ELSEIF @n == 2 THEN ]%%two%%[ ELSE ]%%other%%[ ENDIF ]%%';
  assert.equal(html('%%[ SET @n = 1 ]%%' + tpl), 'one');
  assert.equal(html('%%[ SET @n = 2 ]%%' + tpl), 'two');
  assert.equal(html('%%[ SET @n = 9 ]%%' + tpl), 'other');
});

test('nested IF', () => {
  const tpl = '%%[ SET @a = "x" SET @b = "y" IF @a == "x" THEN IF @b == "y" THEN ]%%both%%[ ENDIF ENDIF ]%%';
  assert.equal(html(tpl), 'both');
});

test('AND / OR / NOT and parentheses', () => {
  assert.equal(html('%%=IIF((1 == 1 AND 2 == 3) OR NOT 1 == 2, "yes", "no")=%%'), 'yes');
  assert.equal(html('%%=IIF(1 == 1 AND 2 == 3, "yes", "no")=%%'), 'no');
});

test('string comparison is case-insensitive, numbers compare numerically', () => {
  assert.equal(html('%%=IIF("GOLD" == "gold", "y", "n")=%%'), 'y');
  assert.equal(html('%%=IIF("10" > "9", "y", "n")=%%'), 'y');
  assert.equal(html('%%=IIF(5 != 5, "y", "n")=%%'), 'n');
});

test('FOR TO and DOWNTO with NEXT', () => {
  assert.equal(html('%%[ FOR @i = 1 TO 3 DO ]%%%%=v(@i)=%%%%[ NEXT @i ]%%'), '123');
  assert.equal(html('%%[ FOR @i = 3 DOWNTO 1 DO ]%%%%=v(@i)=%%%%[ NEXT ]%%'), '321');
  assert.equal(html('%%[ FOR @i = 5 TO 1 DO ]%%x%%[ NEXT @i ]%%'), '');
});

test('negative numbers', () => {
  assert.equal(html('%%=Add(-5, 2)=%%'), '-3');
  assert.equal(html('%%[ SET @x = -1.5 ]%%%%=v(@x)=%%'), '-1.5');
});

test('server-side <script> blocks', () => {
  assert.equal(html('<script runat="server" language="ampscript">SET @a = "ok"</script>%%=v(@a)=%%'), 'ok');
});

test('client-side scripts are left alone', () => {
  assert.equal(html('<script>var a = 1;</script>'), '<script>var a = 1;</script>');
});

// --- Subscriber data --------------------------------------------------------------

test('personalization strings and attributes', () => {
  const opts = { subscriber: { FirstName: 'Faisal', 'Member Since': '2019', EmailAddress: 'f@example.com' } };
  assert.equal(html('Hi %%FirstName%%, %%Member Since%%, %%emailaddr%%', opts), 'Hi Faisal, 2019, f@example.com');
  assert.equal(html('%%=AttributeValue("firstname")=%%|%%=v([Member Since])=%%|%%=v(FirstName)=%%', opts), 'Faisal|2019|Faisal');
});

test('missing attribute renders empty with a warning', () => {
  const r = run('Hi %%LastName%%!', { subscriber: {} });
  assert.equal(r.html, 'Hi !');
  assert.match(r.warnings[0], /LastName/);
});

test('system strings have placeholder values', () => {
  assert.equal(html('<a href="%%view_email_url%%">'), '<a href="#view-email">');
});

test('unset variable is empty and warns', () => {
  const r = run('[%%=v(@nope)=%%]');
  assert.equal(r.html, '[]');
  assert.match(r.warnings[0], /@nope/);
});

// --- String functions ---------------------------------------------------------------

test('string functions', () => {
  assert.equal(html('%%=Length("hello")=%%'), '5');
  assert.equal(html('%%=Substring("Marketing", 1, 6)=%%'), 'Market');
  assert.equal(html('%%=Substring("Marketing", 7)=%%'), 'ing');
  assert.equal(html('%%=IndexOf("hello", "l")=%%|%%=IndexOf("hello", "z")=%%'), '3|0');
  assert.equal(html('%%=Uppercase("a")=%%%%=Lowercase("B")=%%'), 'Ab');
  assert.equal(html('%%=ProperCase("mARY-jane o\'neil")=%%'), "Mary-Jane O'Neil");
  assert.equal(html('[%%=Trim("  x  ")=%%]'), '[x]');
  assert.equal(html('%%=Replace("a-b-c", "-", "+")=%%'), 'a+b+c');
  assert.equal(html('%%=ReplaceList("a,b;c", " ", ",", ";")=%%'), 'a b c');
  assert.equal(html('%%=Char(65, 3)=%%'), 'AAA');
  assert.equal(html('%%=RegExMatch("Order #A123", "#([A-Z]\\d+)", 1)=%%'), 'A123');
});

test('Substring rejects position 0 with a helpful message', () => {
  assert.match(error('%%=Substring("abc", 0, 1)=%%').message, /counts from 1/);
});

test('validation functions', () => {
  assert.equal(html('%%=Empty("")=%%|%%=Empty("x")=%%|%%=IsNull(@x)=%%'), 'True|False|True');
  assert.equal(html('%%=IsEmailAddress("a@b.co")=%%|%%=IsEmailAddress("nope")=%%'), 'True|False');
  assert.equal(html('%%=IsPhoneNumber("(555) 123-4567")=%%'), 'True');
});

// --- Maths & formatting ------------------------------------------------------------

test('maths functions', () => {
  assert.equal(html('%%=Add(1.1, 2.2)=%%'), '3.3');
  assert.equal(html('%%=Subtract(10, 4)=%%|%%=Multiply(3, 4)=%%|%%=Divide(10, 4)=%%|%%=Mod(10, 3)=%%'), '6|12|2.5|1');
  const r = Number(html('%%=Random(1, 3)=%%'));
  assert.ok(r >= 1 && r <= 3);
});

test('maths errors', () => {
  assert.match(error('%%=Divide(1, 0)=%%').message, /divide by zero/);
  assert.match(error('%%=Add("abc", 1)=%%').message, /not a valid number/);
});

test('number formatting', () => {
  assert.equal(html('%%=FormatNumber(1234.5, "N2")=%%'), '1,234.50');
  assert.equal(html('%%=Format(0.256, "P1")=%%'), '25.6%');
  assert.equal(html('%%=FormatNumber(3.14159, "F3")=%%'), '3.142');
  assert.equal(html('%%=FormatNumber(1234567, "#,##0")=%%'), '1,234,567');
  assert.equal(html('%%=FormatCurrency(99.5, "en-US")=%%'), '$99.50');
});

// --- Dates ---------------------------------------------------------------------------

test('Now() outputs SFMC default date format', () => {
  assert.equal(html('%%=Now()=%%'), '10/4/2026 9:30:00 AM');
});

test('FormatDate', () => {
  assert.equal(html('%%=FormatDate("2026-10-04 14:05:00", "dddd, MMMM d, yyyy")=%%'), 'Sunday, October 4, 2026');
  assert.equal(html('%%=FormatDate("10/4/2026 2:05 PM", "yyyy-MM-dd", "HH:mm")=%%'), '2026-10-04 14:05');
  assert.equal(html('%%=FormatDate("2026-10-04", "s")=%%'), '2026-10-04T00:00:00');
  assert.equal(html('%%=FormatDate("2026-10-04 09:05:00", "hh:mm tt")=%%'), '09:05 AM');
});

test('DateAdd / DateDiff / DatePart', () => {
  assert.equal(html('%%=FormatDate(DateAdd("2026-01-31", 1, "M"), "yyyy-MM-dd")=%%'), '2026-03-03');
  assert.equal(html('%%=FormatDate(DateAdd(Now(), -7, "D"), "yyyy-MM-dd")=%%'), '2026-09-27');
  assert.equal(html('%%=DateDiff("2026-01-01", "2026-12-25", "D")=%%'), '358');
  assert.equal(html('%%=DateDiff("2000-06-15", Now(), "Y")=%%'), '26');
  assert.equal(html('%%=DatePart("2026-10-04", "monthname")=%%|%%=DatePart("2026-10-04", "D")=%%'), 'October|4');
});

test('dates compare as dates', () => {
  assert.equal(html('%%=IIF(Now() > "1/1/2026", "after", "before")=%%'), 'after');
});

test('invalid date gives a clear error', () => {
  assert.match(error('%%=FormatDate("next tuesday", "yyyy")=%%').message, /not a valid date/);
});

// --- Data extensions -------------------------------------------------------------------

const DES = {
  Orders: [
    { Email: 'a@x.com', Item: 'Shoes', Total: 120, Date: '2026-09-01' },
    { Email: 'a@x.com', Item: 'Hat', Total: 35.5, Date: '2026-09-20' },
    { Email: 'b@x.com', Item: 'Bag', Total: 80, Date: '2026-09-10' },
    { Email: 'A@X.COM', Item: 'Scarf', Total: 60, Date: '2026-08-01' }
  ],
  Members: [{ SubscriberKey: '001', Tier: 'Gold' }]
};

test('Lookup is case-insensitive for DE, field and value', () => {
  assert.equal(html('%%=Lookup("members", "tier", "subscriberkey", "001")=%%', { dataExtensions: DES }), 'Gold');
  assert.equal(html('[%%=Lookup("Members", "Tier", "SubscriberKey", "999")=%%]', { dataExtensions: DES }), '[]');
});

test('LookupRows + RowCount + Row + Field loop', () => {
  const tpl = '%%[ SET @rows = LookupRows("Orders", "Email", "a@x.com") FOR @i = 1 TO RowCount(@rows) DO SET @r = Row(@rows, @i) ]%%%%=Field(@r, "Item")=%%,%%[ NEXT @i ]%%';
  assert.equal(html(tpl, { dataExtensions: DES }), 'Shoes,Hat,Scarf,');
});

test('LookupOrderedRows sorts and limits', () => {
  const tpl = '%%[ SET @rows = LookupOrderedRows("Orders", 2, "Total desc", "Email", "a@x.com") ]%%%%=Field(Row(@rows, 1), "Item")=%%/%%=Field(Row(@rows, 2), "Item")=%%/%%=RowCount(@rows)=%%';
  assert.equal(html(tpl, { dataExtensions: DES }), 'Shoes/Scarf/2');
  const byDate = '%%=Field(Row(LookupOrderedRows("Orders", 1, "Date desc", "Email", "a@x.com"), 1), "Item")=%%';
  assert.equal(html(byDate, { dataExtensions: DES }), 'Hat');
});

test('data extension errors are helpful', () => {
  assert.match(error('%%=Lookup("Nope", "a", "b", "c")=%%', { dataExtensions: DES }).message, /"Nope" not found/);
  assert.match(error('%%=Field(Row(LookupRows("Orders", "Email", "b@x.com"), 1), "Colour")=%%', { dataExtensions: DES }).message, /"Colour" not found/);
  assert.match(error('%%=Row(LookupRows("Orders", "Email", "z@x.com"), 1)=%%', { dataExtensions: DES }).message, /does not exist/);
  assert.equal(html('[%%=Field(Row(LookupRows("Orders", "Email", "b@x.com"), 1), "Colour", false)=%%]', { dataExtensions: DES }), '[]');
});

test('BuildRowsetFromString', () => {
  const tpl = '%%[ SET @r = BuildRowsetFromString("red|green|blue", "|") FOR @i = 1 TO RowCount(@r) DO ]%%%%=Field(Row(@r, @i), 1)=%% %%[ NEXT ]%%';
  assert.equal(html(tpl), 'red green blue ');
});

test('BuildRowsetFromJSON', () => {
  const tpl = `%%[ SET @r = BuildRowsetFromJSON('{"items":[{"name":"A"},{"name":"B"}]}', "$.items[*]") ]%%%%=RowCount(@r)=%%:%%=Field(Row(@r, 2), "name")=%%`;
  assert.equal(html(tpl), '2:B');
});

test('UpsertDE / InsertDE / DeleteDE change the in-memory data', () => {
  const r = run(
    '%%[ UpsertDE("Members", 1, "SubscriberKey", "001", "Tier", "Platinum") InsertDE("Members", "SubscriberKey", "002", "Tier", "Silver") ]%%' +
    '%%=Lookup("Members", "Tier", "SubscriberKey", "001")=%%,%%=DataExtensionRowCount("Members")=%%' +
    '%%[ DeleteDE("Members", "SubscriberKey", "002") ]%%,%%=DataExtensionRowCount("Members")=%%',
    { dataExtensions: DES }
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.html, 'Platinum,2,1');
  assert.equal(DES.Members[0].Tier, 'Gold', 'original data must not be mutated');
  assert.equal(r.log.length, 3);
});

// --- Content & control -------------------------------------------------------------------

test('TreatAsContent and content blocks', () => {
  const opts = { subscriber: { FirstName: 'Ana' }, contentBlocks: { footer: '<footer>Bye %%FirstName%%</footer>' } };
  assert.equal(html('%%=TreatAsContent("Hi %%FirstName%%")=%%', opts), 'Hi Ana');
  assert.equal(html('%%=ContentBlockByKey("FOOTER")=%%', opts), '<footer>Bye Ana</footer>');
});

test('missing content block renders a placeholder and warns', () => {
  const r = run('%%=ContentBlockByKey("hero")=%%');
  assert.match(r.html, /ContentBlockByKey\(hero\)/);
  assert.match(r.warnings[0], /hero/);
});

test('RaiseError stops rendering', () => {
  const r = run('before%%[ RaiseError("No email", true) ]%%after');
  assert.equal(r.raised, true);
  assert.match(r.errors[0].message, /No email/);
});

test('Output and OutputLine inside code blocks', () => {
  assert.equal(html('%%[ Output(Concat("a", "b")) OutputLine("c") ]%%d'), 'abc\nd');
});

test('RedirectTo, URL and Base64 helpers', () => {
  assert.equal(html('<a href="%%=RedirectTo("https://x.com/?a=1 b")=%%">'), '<a href="https://x.com/?a=1 b">');
  assert.equal(html('%%=URLEncode("https://x.com/a b")=%%'), 'https://x.com/a%20b');
  assert.equal(html('%%=Base64Encode("héllo ⭐")=%%'), 'aMOpbGxvIOKtkA==');
  assert.equal(html('%%=Base64Decode(Base64Encode("héllo ⭐"))=%%'), 'héllo ⭐');
  assert.equal(html('%%=SHA256("abc")=%%'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('RequestParameter for CloudPages', () => {
  assert.equal(html('%%=RequestParameter("id")=%%', { requestParameters: { ID: '42' } }), '42');
});

// --- Error reporting ------------------------------------------------------------------------

test('errors report the line number', () => {
  const e = error('<p>\n</p>\n%%[\nSET @a = Concat("x"\n]%%');
  assert.equal(e.line, 5);
  assert.match(e.message, /Expected \) or ,/);
});

test('common mistakes get friendly messages', () => {
  assert.match(error('%%[ IF @a = 1 THEN ]%%x%%[ ENDIF ]%%').message, /Use ==/);
  assert.match(error('%%[ IF 1 == 1 THEN ]%%x').message, /missing its ENDIF/);
  assert.match(error('%%[ ENDIF ]%%').message, /without a matching IF/);
  assert.match(error('%%[ SET @a = 1').message, /missing its closing \]%%/);
  assert.match(error('%%=v(@a)').message, /missing its closing =%%/);
  assert.match(error('%%[ SET @a = “x” ]%%').message, /Curly quotes/);
  assert.match(error('%%[ // nope\n ]%%').message, /\/\* \.\.\. \*\//);
  assert.match(error('%%=Concat()=%%').message, /expects at least 1 argument/);
  assert.match(error('%%=Lenght("x")=%%').message, /Unknown function Lenght/);
  assert.match(error('%%=HTTPGet("https://x.com")=%%').message, /not available in the playground/);
  assert.match(error('%%=Constructor()=%%').message, /Unknown function/);
});

test('runaway loops are stopped', () => {
  assert.match(error('%%[ FOR @i = 1 TO 1000000 DO NEXT @i ]%%').message, /more than/);
});

test('content blocks that include themselves are stopped', () => {
  const r = run('%%=ContentBlockByKey("loop")=%%', { contentBlocks: { loop: '%%=ContentBlockByKey("loop")=%%' } });
  assert.match(r.errors[0].message, /nested too deeply/);
});
