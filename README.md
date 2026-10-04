# AMPscript Playground

[![Tests](https://github.com/faisal8143/ampscript-playground/actions/workflows/tests.yml/badge.svg)](https://github.com/faisal8143/ampscript-playground/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Write **Salesforce Marketing Cloud AMPscript** and see the rendered email instantly, in your browser. Plug in mock subscriber attributes, data extensions and content blocks, change the send date, and test every branch of your personalisation without a Marketing Cloud login, a publish, or a test send.

**[Open the playground →](https://faisal8143.github.io/ampscript-playground/)**

<img src="docs/screenshot.png" alt="AMPscript Playground: AMPscript editor with syntax highlighting on the left, rendered email preview on the right" width="900">

## Why

Testing AMPscript in SFMC is slow: save, preview, pick a subscriber, find the error, repeat. Preview needs real data in real data extensions, and error messages rarely say where the problem is.

The playground gives you a fast loop for the logic:

- **Live preview** as you type, at desktop or mobile width
- **Mock data**: subscriber attributes, data extensions, content blocks and CloudPage parameters as JSON
- **Send date control**: set what `Now()` returns to test birthday, expiry and countdown logic
- **Clear errors with line numbers**, plus friendly hints for common mistakes (`=` instead of `==`, curly quotes, `//` comments, missing `ENDIF`, `Substring` starting at 0)
- **Warnings** for empty personalisation strings and variables used before `SET`
- **Data writes** (`UpsertDE`, `InsertData`, …) applied to the mock data so you can see what a CloudPage would store
- **Share links** that carry your template and data
- Runs entirely in the browser; nothing is sent anywhere

## What it supports

**Syntax:** `%%[ ]%%` blocks, `%%= =%%` inline output, `<script runat="server" language="ampscript">`, personalisation strings (`%%FirstName%%`, `%%emailaddr%%`, `%%view_email_url%%` …), `[Attribute Name]`, `VAR`, `SET`, `IF / ELSEIF / ELSE / ENDIF` (including around HTML), `FOR … TO / DOWNTO … DO / NEXT`, `AND / OR / NOT`, `/* comments */`. Keywords, function names, attributes and comparisons are case-insensitive, as in SFMC.

**Functions (60+):**

| Area | Functions |
|---|---|
| Output | `Output` `OutputLine` `V` |
| Strings | `Concat` `Length` `Substring` `IndexOf` `Uppercase` `Lowercase` `ProperCase` `Trim` `Replace` `ReplaceList` `Char` `StringToHex` `RegExMatch` |
| Logic & validation | `IIF` `Empty` `IsNull` `IsEmailAddress` `IsPhoneNumber` |
| Maths | `Add` `Subtract` `Multiply` `Divide` `Mod` `Random` |
| Formatting | `Format` `FormatNumber` `FormatCurrency` |
| Dates | `Now` `DateAdd` `DateDiff` `DatePart` `FormatDate` `StringToDate` `DateParse` `SystemDateToLocalDate` `LocalDateToSystemDate` |
| Data extensions | `Lookup` `LookupRows` `LookupOrderedRows` `RowCount` `Row` `Field` `DataExtensionRowCount` `BuildRowsetFromString` `BuildRowsetFromJSON` `InsertDE` `UpsertDE` `UpdateDE` `DeleteDE` `InsertData` `UpsertData` `UpdateData` `DeleteData` |
| Content | `TreatAsContent` `ContentBlockByKey` `ContentBlockByName` `ContentBlockById` `AttributeValue` |
| CloudPages | `RequestParameter` `QueryStringParameter` `CloudPagesURL` `Redirect` `RedirectTo` |
| Utilities | `RaiseError` `Base64Encode` `Base64Decode` `URLEncode` `EscapeDataString` `SHA256` `GUID` |

Functions that call external services (`HTTPGet`, `RetrieveSalesforceObjects`, …) or need SFMC key management (`EncryptSymmetric`) show a clear "not available in the playground" message.

> This is an independent interpreter, not Salesforce's engine. It aims to match SFMC's behaviour for the features above, but formatting and edge cases can differ. Always do a final test send in Marketing Cloud.

## Use the engine in your own code

The interpreter is a single dependency-free file that works in the browser and in Node.js 18+.

```js
const AMPscript = require('./src/ampscript.js');

const result = AMPscript.render('Hi %%=ProperCase(AttributeValue("FirstName"))=%%!', {
  subscriber: { FirstName: 'aMIRA' },
  dataExtensions: { Orders: [{ Email: 'a@example.com', Total: 42 }] },
  contentBlocks: { footer: '<p>Footer</p>' },
  requestParameters: { id: '123' },
  now: '2026-10-04T09:00:00'
});

result.html;      // 'Hi Amira!'
result.errors;    // [{ message, line }]
result.warnings;  // ['Personalization string %%LastName%% has no value ...']
result.log;       // data extension writes
```

Handy for **unit-testing AMPscript in CI**: render your templates against fixture data and assert on the output.

## Development

```bash
npm test          # runs the engine tests (no dependencies to install)
```

Open `index.html` through any local web server (for example `npx serve .`) to work on the playground UI.

## Contributing

Bug reports with a small AMPscript sample are the most helpful thing you can send: what SFMC outputs versus what the playground outputs. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Faisal Irfan. Not affiliated with or endorsed by Salesforce. Salesforce, Marketing Cloud and AMPscript are trademarks of Salesforce, Inc.
