"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("editor exposes every public node as an inline Flow Library definition", () => {
  const editorHtml = fs.readFileSync(
    path.join(__dirname, "..", "nodes", "adanos.html"),
    "utf8",
  );

  for (const type of [
    "adanos-stock",
    "adanos-crypto",
    "adanos-trending",
    "adanos-compare",
  ]) {
    assert.match(
      editorHtml,
      new RegExp(`RED\\.nodes\\.registerType\\("${type}",\\s*\\{`),
      `${type} must use an inline object definition`,
    );
  }
});
