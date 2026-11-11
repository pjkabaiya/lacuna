const fs = require('fs');
const path = require('path');

const lessonsDir = path.resolve(process.env.LESSONS_DIR || path.join(__dirname, '../public/lessons'));
const manifestPath = path.join(lessonsDir, 'index.json');
const errors = [];

function fail(file, message) {
  errors.push(`${path.relative(process.cwd(), file)}: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(file, `invalid JSON (${error.message})`);
    return null;
  }
}

const manifest = readJson(manifestPath);
if (manifest && !Array.isArray(manifest.lessons)) {
  fail(manifestPath, 'lessons must be an array');
}

const manifestIds = new Set();
if (manifest && Array.isArray(manifest.lessons)) {
  manifest.lessons.forEach((entry, index) => {
    if (!entry || !/^[a-z0-9-]{1,80}$/.test(entry.id || '')) {
      fail(manifestPath, `lesson ${index + 1} has an invalid id`);
      return;
    }
    if (manifestIds.has(entry.id)) fail(manifestPath, `duplicate lesson id "${entry.id}"`);
    manifestIds.add(entry.id);
    if (typeof entry.title !== 'string' || !entry.title.trim()) {
      fail(manifestPath, `lesson "${entry.id}" needs a title`);
    }
    if (!Number.isInteger(entry.order) || entry.order < 1) {
      fail(manifestPath, `lesson "${entry.id}" needs a positive order`);
    }
    if (entry.language !== 'python') fail(manifestPath, `lesson "${entry.id}" must use python`);
  });
}

const lessonFiles = fs.existsSync(lessonsDir)
  ? fs.readdirSync(lessonsDir).filter((name) => name.endsWith('.json') && name !== 'index.json')
  : [];
const fileIds = new Set(lessonFiles.map((name) => name.slice(0, -5)));

lessonFiles.forEach((name) => {
  const file = path.join(lessonsDir, name);
  const lesson = readJson(file);
  if (lesson === null) {
    fail(file, 'lesson must be a JSON object');
    return;
  }
  if (typeof lesson !== 'object' || Array.isArray(lesson)) {
    fail(file, 'lesson must be a JSON object');
    return;
  }
  if (lesson.id !== name.slice(0, -5)) fail(file, 'id must match the JSON filename');
  if (!manifestIds.has(lesson.id)) fail(file, 'lesson is missing from index.json');
  if (lesson.language !== 'python') fail(file, 'language must be python');
  if (typeof lesson.title !== 'string' || !lesson.title.trim()) fail(file, 'title is required');
  if (!Array.isArray(lesson.steps) || lesson.steps.length < 6 || lesson.steps.length > 8) {
    fail(file, 'steps must contain 6 to 8 entries');
    return;
  }
  const stepIds = new Set();
  lesson.steps.forEach((step, index) => {
    const label = `step ${index + 1}`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      fail(file, `${label} must be an object`);
      return;
    }
    if (!/^[a-z0-9-]{1,40}$/.test(step.id || '')) {
      fail(file, `${label} has an invalid id`);
    } else if (stepIds.has(step.id)) {
      fail(file, `${label} repeats id "${step.id}"`);
    } else {
      stepIds.add(step.id);
    }
    if (typeof step.note !== 'string' || !step.note.trim()) fail(file, `${label} needs a note`);
    if (!Array.isArray(step.code) || !step.code.length || step.code.some((line) => typeof line !== 'string')) {
      fail(file, `${label} code must be a non-empty array of strings`);
    } else {
      const lastLineBlanks = step.code[step.code.length - 1].match(/___/g) || [];
      if (lastLineBlanks.length !== 1) {
        fail(file, `${label} last code line must contain exactly one ___ blank marker`);
      }
      if (step.code.slice(0, -1).some((line) => line.includes('___'))) {
        fail(file, `${label} blank marker may only appear in the last code line`);
      }
    }
    if (!Array.isArray(step.choices) || step.choices.length < 3 || step.choices.length > 4) {
      fail(file, `${label} must have 3 or 4 choices`);
    } else {
      if (!Number.isInteger(step.answer) || step.answer < 0 || step.answer >= step.choices.length) {
        fail(file, `${label} answer must point to a choice`);
      }
      step.choices.forEach((choice, choiceIndex) => {
        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
          fail(file, `${label} choice ${choiceIndex + 1} must be an object`);
          return;
        }
        if (typeof choice.text !== 'string' || !choice.text.trim()) {
          fail(file, `${label} choice ${choiceIndex + 1} needs text`);
        }
        if (typeof choice.why !== 'string' || !choice.why.trim()) {
          fail(file, `${label} choice ${choiceIndex + 1} needs a friendly why explanation`);
        }
      });
    }
    if (!['copy', 'recall', 'none'].includes(step.typeMode)) {
      fail(file, `${label} typeMode must be copy, recall, or none`);
    }
    if (step.typeScope !== undefined && !['blank', 'line'].includes(step.typeScope)) {
      fail(file, `${label} typeScope must be blank or line`);
    }
    if (typeof step.explain !== 'string' || !step.explain.trim()) {
      fail(file, `${label} needs an explain message`);
    }
    if (typeof step.output !== 'string') fail(file, `${label} output must be a string`);
  });
  if (typeof lesson.finalOutput !== 'string') fail(file, 'finalOutput must be a string');
});

manifestIds.forEach((id) => {
  if (!fileIds.has(id)) fail(manifestPath, `lesson "${id}" has no matching JSON file`);
});

if (errors.length) {
  console.error(`Lesson validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Validated ${lessonFiles.length} lessons successfully.`);
}
