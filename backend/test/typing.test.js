const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const browser = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.resolve(__dirname, '../../public/js/validate.js'), 'utf8'),
  browser,
);
const { diagnose, matches } = browser.window.LacunaValidate;

test('typing accepts harmless spacing and normalizes curly quotes', () => {
  assert.equal(matches('name="Mira"', 'name = "Mira"'), true);
  assert.match(diagnose('name="Mira"', 'name = "Mira"'), /spacing is valid/i);
  assert.equal(matches('print(“Hello”)', 'print("Hello")'), true);
  assert.match(diagnose('print(“Hello”)', 'print("Hello")'), /straight quotes/i);
  assert.equal(matches('"Hello" + " " + "world"', '"Hello"+" "+"world"'), true);
});

test('typing diagnoses common quote, bracket, colon, and case mistakes', () => {
  assert.match(diagnose('print("Hello)', 'print("Hello")'), /closing quote/i);
  assert.match(diagnose('"name"', 'name'), /quotes/i);
  assert.match(diagnose('print("Hello"', 'print("Hello")'), /bracket/i);
  assert.match(diagnose('if ready', 'if ready:'), /colon/i);
  assert.match(diagnose('Print("Hello")', 'print("Hello")'), /case-sensitive/i);
});
