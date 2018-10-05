module.exports = {
  "env": {
    "node": true,
    "es6": true,
  },
  "extends": [
    "eslint:recommended",
  ],
  "parser": "babel-eslint",
  "rules": {
    "indent": [
      "error",
      2,
    ],
    "linebreak-style": [
      "error",
      "unix",
    ],
    "quotes": [
      "error",
      "single",
      { "avoidEscape": true },
    ],
    "semi": [
      "error",
      "never",
    ],
    "comma-dangle": [
      "error",
      "never",
    ],
    "no-console": [
      "error",
      { allow: ["warn", "error"] },
    ],
    "comma-dangle": [
      "error",
      "only-multiline",
    ],
    "no-unused-vars": [
      "error",
      { "ignoreRestSiblings": true },
    ],
  },
}
