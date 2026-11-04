export default [
  {
    files: ["src/**/*.js"],
    ignores: ["src/store.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='cache'][callee.property.name='set']",
          message: "Write prices through savePrice in src/store.js: a direct cache write skips invalidation, so readers keep serving the old price.",
        },
      ],
    },
  },
]
