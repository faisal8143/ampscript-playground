// GENERATED from src/functions.js by scripts/sync-vscode.js. Do not edit.
/*!
 * AMPscript function reference used for editor completion and hover help.
 * MIT License (c) Faisal Irfan
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AMPscriptFunctions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [name, parameters, description]
  var LIST = [
    // Output
    ['Output', 'value', 'Writes the value into the content at this point. Use inside %%[ ]%% blocks.'],
    ['OutputLine', 'value', 'Writes the value followed by a line break.'],
    ['V', 'value', 'Returns the value. Common in inline output: %%=v(@name)=%%.'],
    // Strings
    ['Concat', 'value1, value2, ...', 'Joins values into one string.'],
    ['Length', 'string', 'Number of characters in the string.'],
    ['Substring', 'string, start, [length]', 'Part of a string. Positions start at 1.'],
    ['IndexOf', 'string, search', 'Position of search in string, starting at 1. Returns 0 when not found.'],
    ['Uppercase', 'string', 'Converts to upper case.'],
    ['Lowercase', 'string', 'Converts to lower case.'],
    ['ProperCase', 'string', 'Capitalises the first letter of each word.'],
    ['Trim', 'string', 'Removes spaces from both ends.'],
    ['Replace', 'string, find, replaceWith', 'Replaces every occurrence of find.'],
    ['ReplaceList', 'string, replaceWith, find1, [find2, ...]', 'Replaces each of the find values with replaceWith.'],
    ['Char', 'charCode, [repeat]', 'Character for an ASCII code, optionally repeated.'],
    ['StringToHex', 'string', 'Hexadecimal bytes of the UTF-8 string.'],
    ['RegExMatch', 'string, pattern, group, [options]', 'Returns the matched group (number or name). Option: "IgnoreCase".'],
    // Logic
    ['IIF', 'condition, valueIfTrue, valueIfFalse', 'Returns one of two values depending on the condition.'],
    ['Empty', 'value', 'True when the value is null or an empty string.'],
    ['IsNull', 'value', 'True when the value is null.'],
    ['IsEmailAddress', 'string', 'True when the string looks like a valid email address.'],
    ['IsPhoneNumber', 'string', 'True when the string is a valid 10 or 11 digit phone number.'],
    // Maths
    ['Add', 'number1, number2', 'Adds two numbers.'],
    ['Subtract', 'number1, number2', 'Subtracts number2 from number1.'],
    ['Multiply', 'number1, number2', 'Multiplies two numbers.'],
    ['Divide', 'number1, number2', 'Divides number1 by number2.'],
    ['Mod', 'number1, number2', 'Remainder after dividing number1 by number2.'],
    ['Random', 'min, max', 'Random whole number between min and max.'],
    // Formatting
    ['Format', 'value, format, [type], [culture]', 'Formats a number ("N2", "C", "P0") or date ("dddd, MMMM d").'],
    ['FormatNumber', 'number, format, [culture]', 'Formats a number, e.g. "N2" or "#,##0.00".'],
    ['FormatCurrency', 'number, culture, [decimals], [symbol]', 'Formats a number as currency for a culture such as "en-AU".'],
    // Dates
    ['Now', '[preserveSendTime]', 'Current date and time (the send time during a send).'],
    ['DateAdd', 'date, number, unit', 'Adds time to a date. Units: Y, M, D, H, MI.'],
    ['DateDiff', 'date1, date2, unit', 'Difference between two dates. Units: Y, M, D, H, MI.'],
    ['DatePart', 'date, part', 'Part of a date: Y, M, D, H, MI, monthname or dayname.'],
    ['FormatDate', 'date, dateFormat, [timeFormat], [culture]', 'Formats a date, e.g. "dddd, MMMM d, yyyy".'],
    ['StringToDate', 'string, [culture]', 'Converts a string to a date.'],
    ['DateParse', 'string, [returnUTC]', 'Converts a string to a date.'],
    ['SystemDateToLocalDate', 'date', 'Converts server time to the account time zone.'],
    ['LocalDateToSystemDate', 'date', 'Converts account time zone to server time.'],
    // Data extensions
    ['Lookup', 'deName, returnField, matchField, matchValue, [...]', 'Value of returnField from the first matching row.'],
    ['LookupRows', 'deName, matchField, matchValue, [...]', 'Rowset of all matching rows (up to 2,000).'],
    ['LookupOrderedRows', 'deName, count, orderBy, matchField, matchValue, [...]', 'Sorted rowset. orderBy like "Date desc". count 0 returns all.'],
    ['RowCount', 'rowset', 'Number of rows in a rowset.'],
    ['Row', 'rowset, index', 'One row from a rowset. Index starts at 1.'],
    ['Field', 'row, fieldName, [throwIfMissing]', 'Value of a field in a row.'],
    ['DataExtensionRowCount', 'deName', 'Number of rows in a data extension.'],
    ['BuildRowsetFromString', 'string, delimiter', 'Rowset from a delimited string. Read values with Field(row, 1).'],
    ['BuildRowsetFromJSON', 'json, jsonPath, [returnEmptyOnError]', 'Rowset from a JSON array, e.g. "$.items[*]".'],
    ['InsertDE', 'deName, field, value, [...]', 'Inserts a row (email sends). Returns nothing.'],
    ['UpsertDE', 'deName, keyCount, keyField, keyValue, [...], field, value, [...]', 'Updates or inserts a row (email sends).'],
    ['UpdateDE', 'deName, keyCount, keyField, keyValue, [...], field, value, [...]', 'Updates matching rows (email sends).'],
    ['DeleteDE', 'deName, field, value, [...]', 'Deletes matching rows (email sends).'],
    ['InsertData', 'deName, field, value, [...]', 'Inserts a row and returns the row count (CloudPages).'],
    ['UpsertData', 'deName, keyCount, keyField, keyValue, [...], field, value, [...]', 'Updates or inserts a row (CloudPages).'],
    ['UpdateData', 'deName, keyCount, keyField, keyValue, [...], field, value, [...]', 'Updates matching rows (CloudPages).'],
    ['DeleteData', 'deName, field, value, [...]', 'Deletes matching rows (CloudPages).'],
    // Content
    ['TreatAsContent', 'string', 'Evaluates a string as AMPscript content.'],
    ['ContentBlockByKey', 'customerKey, [regionName], [throwIfMissing]', 'Content Builder block by external key.'],
    ['ContentBlockByName', 'path, [regionName], [throwIfMissing]', 'Content Builder block by folder path and name.'],
    ['ContentBlockById', 'id, [regionName], [throwIfMissing]', 'Content Builder block by ID.'],
    ['AttributeValue', 'name', 'Subscriber attribute; returns empty instead of an error when missing.'],
    // CloudPages
    ['RequestParameter', 'name', 'Query string or form value on a CloudPage.'],
    ['QueryStringParameter', 'name', 'Query string value on a CloudPage.'],
    ['CloudPagesURL', 'pageId, [name, value, ...]', 'Encrypted link to a CloudPage with parameters.'],
    ['Redirect', 'url, [permanent]', 'Redirects a CloudPage visitor.'],
    ['RedirectTo', 'url', 'Use around a variable in href so link tracking keeps working.'],
    // Utilities
    ['RaiseError', 'message, [skipSend], [code], [subCode], [reserved]', 'Stops the send for this subscriber with a message.'],
    ['Base64Encode', 'string, [charset]', 'Base64-encodes a string.'],
    ['Base64Decode', 'string, [charset], [throwOnError]', 'Decodes a Base64 string.'],
    ['URLEncode', 'url, [spaces], [all]', 'Encodes a URL.'],
    ['EscapeDataString', 'string', 'Percent-encodes a string for use in a URL.'],
    ['SHA256', 'string, [charset]', 'SHA-256 hash in hexadecimal.'],
    ['GUID', '', 'New unique identifier.']
  ];

  var byName = {};
  LIST.forEach(function (f) { byName[f[0].toLowerCase()] = { name: f[0], params: f[1], description: f[2] }; });

  return {
    list: LIST.map(function (f) { return byName[f[0].toLowerCase()]; }),
    get: function (name) { return byName[String(name || '').toLowerCase()] || null; },
    signature: function (f) { return f.name + '(' + f.params + ')'; }
  };
});
