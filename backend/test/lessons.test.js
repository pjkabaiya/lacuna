const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('lesson validator rejects a broken lesson with actionable errors', () => {
  const lessonsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacuna-lessons-'));
  try {
    fs.writeFileSync(path.join(lessonsDir, 'index.json'), JSON.stringify({
      lessons: [{ id: 'broken-lesson', title: 'Broken', order: 1, language: 'python' }],
    }));
    fs.writeFileSync(path.join(lessonsDir, 'broken-lesson.json'), JSON.stringify({
      id: 'broken-lesson',
      language: 'python',
      title: 'Broken',
      steps: [{ id: 'one', code: ['print()'], choices: [], answer: 9, typeMode: 'invalid' }],
    }));

    assert.throws(
      () => execFileSync(process.execPath, [path.resolve(__dirname, '../../tools/validate-lessons.js')], {
        encoding: 'utf8',
        env: { ...process.env, LESSONS_DIR: lessonsDir },
      }),
      (error) => {
        const output = `${error.stdout}${error.stderr}`;
        assert.match(output, /Lesson validation failed/);
        assert.match(output, /steps must contain 6 to 8/);
        return true;
      },
    );
  } finally {
    fs.rmSync(lessonsDir, { recursive: true, force: true });
  }
});
