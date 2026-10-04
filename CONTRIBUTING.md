# Contributing

Thanks for helping make AMPscript easier to test.

## Reporting a difference from SFMC

The most useful issue is a small sample where the playground and Marketing Cloud disagree:

1. The AMPscript (as short as possible)
2. The subscriber / data extension data it needs
3. What SFMC outputs
4. What the playground outputs

Please remove any real customer data first.

## Adding or fixing a function

1. Functions live in the `FUNCTIONS` table in `src/ampscript.js`. Each entry declares its minimum and maximum argument count.
2. Add the name to `NAMES` so it appears in the playground's function list.
3. Add tests in `test/engine.test.js`, including at least one error case.
4. Update the function table in `README.md`.

Rules of thumb:

- Match SFMC behaviour where it's documented or verifiable; note it in the PR when you're unsure.
- No dependencies. The engine must stay a single file that runs in browsers and Node.js 18+.
- Error messages should say what went wrong and how to fix it.

## Running tests

```bash
npm test
```
