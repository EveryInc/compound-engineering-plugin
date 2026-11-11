reviewer: cursor[bot]
src/parse.js:22

The quote-escaping regex still mis-handles a backslash before a closing quote: `"a\\"` parses as an unterminated string. Same class of issue as the two earlier escaping comments on this PR.
