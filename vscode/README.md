# AMPscript Preview & Check

Live preview and error checking for **Salesforce Marketing Cloud AMPscript**, right in VS Code. Test your personalisation against sample subscribers and data extensions without a Marketing Cloud login, a publish or a test send.

No .NET, no local server and no setup: install it, open an email, and it works.

![The preview panel showing a rendered email, a subscriber picker and a warning](https://raw.githubusercontent.com/faisal8143/ampscript-playground/main/docs/vscode-preview.png)

## Features

- **Errors as you type** in the Problems panel, with the line number and a plain-English fix: `=` instead of `==`, a missing `ENDIF`, curly quotes, `//` comments, `Substring` starting at 0, unknown functions, wrong argument counts, invalid numbers and dates.
- **Warnings** for personalisation strings with no test value and variables used before `SET`.
- **Live preview** beside your code that updates as you type, at desktop or mobile width.
- **Several test subscribers.** Switch between them in the preview or the status bar, and every one is checked, so a branch that only breaks for a Silver member still gets caught.
- **Data extensions, content blocks and CloudPage parameters** from a simple JSON file or a folder of CSV files.
- **Create Test Data File** reads your template and builds a starter file with the attributes, data extensions and content blocks it uses.
- **Completion, hover help and parameter hints** for 70+ AMPscript functions.
- **Syntax highlighting** for `%%[ ]%%`, `%%= =%%`, `%%Name%%` and `<script runat="server" language="ampscript">`, including inside HTML attributes. `.amp` and `.ampscript` files are supported too.
- Works with **AMPscript Core** projects: `subscriber.json`, `DataExtensions/*.csv` and `Content/` are picked up automatically.

## Getting started

1. Open an HTML email that contains AMPscript.
2. Click the **preview** icon in the editor title bar (or run **AMPscript: Open Preview to the Side**).
3. Run **AMPscript: Create Test Data File** and fill in sample values.

## Test data

The extension looks for data in this order:

1. `<template-name>.data.json` next to the template
2. the nearest `ampscript.data.json` in the folder or a parent folder
3. AMPscript Core folders: `subscriber.json`, `DataExtensions/*.csv`, `Content/*`

```json
{
  "subscribers": [
    { "_label": "Gold member", "SubscriberKey": "001", "FirstName": "Amira", "EmailAddress": "amira@example.com" },
    { "_label": "No first name", "SubscriberKey": "002", "EmailAddress": "sam@example.com" }
  ],
  "dataExtensions": {
    "Loyalty_Members": [
      { "SubscriberKey": "001", "Tier": "Gold", "Points": 12840 }
    ]
  },
  "contentBlocks": { "footer": "<p>Unsubscribe: %%unsub_center_url%%</p>" },
  "now": "2026-12-24T09:00:00"
}
```

`dataExtensions` and `contentBlocks` can also be folder paths (CSV files, one per data extension). `now` sets what `Now()` returns.

## Settings

| Setting | Default | |
|---|---|---|
| `ampscript.diagnostics.enable` | `true` | Show errors as you type |
| `ampscript.diagnostics.warnings` | `true` | Also show warnings |
| `ampscript.dataFile` | | One data file for every template |

## Also available

- **Browser playground:** https://faisal8143.github.io/ampscript-playground/
- **CLI for CI:** `npx ampscript-playground check emails/` fails the build when a template breaks for any test subscriber.

## Limitations

This is an independent AMPscript interpreter, not Salesforce's engine. Functions that call external services (`HTTPGet`, `RetrieveSalesforceObjects`) are not run, and some formatting edge cases can differ. Always do a final test send in Marketing Cloud.

Not affiliated with or endorsed by Salesforce. Salesforce, Marketing Cloud and AMPscript are trademarks of Salesforce, Inc.
