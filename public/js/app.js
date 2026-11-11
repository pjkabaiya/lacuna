(function () {
  const lessonList = document.getElementById('lesson-list');
  if (!lessonList) return;

  async function start() {
    const [manifestResponse, progressResponse] = await Promise.all([
      fetch('lessons/index.json'),
      Promise.resolve(window.LacunaStorage ? window.LacunaStorage.progress() : {}),
    ]);
    if (!manifestResponse.ok) throw new Error('Lessons could not be loaded. Please refresh to try again.');
    const manifest = await manifestResponse.json();
    const progress = progressResponse;
    const lessons = manifest.lessons.slice().sort((a, b) => a.order - b.order);
    lessonList.replaceChildren();

    lessons.forEach((lesson, index) => {
      const saved = progress[lesson.id];
      const done = Boolean(saved && saved.completed);
      const started = Boolean(saved && saved.stepIndex > 0 && !done);
      const card = document.createElement('article');
      card.className = 'lesson-card';

      const top = document.createElement('div');
      top.className = 'lesson-card-top';
      const number = document.createElement('span');
      number.className = 'lesson-index';
      number.textContent = `PYTHON · LESSON ${String(index + 1).padStart(2, '0')}`;
      const state = document.createElement('span');
      state.className = `lesson-state${done ? ' done' : ''}`;
      state.textContent = done ? 'Complete' : started ? 'In progress' : 'Not started';
      top.append(number, state);

      const title = document.createElement('h3');
      title.textContent = lesson.title;
      const summary = document.createElement('p');
      summary.textContent = lesson.summary;
      const link = document.createElement('a');
      link.className = 'button button-primary';
      link.href = `lesson.html?id=${encodeURIComponent(lesson.id)}`;
      link.textContent = done ? 'Review lesson' : started ? 'Continue learning' : 'Start lesson';
      card.append(top, title, summary, link);
      lessonList.append(card);
    });

    const completed = lessons.filter((lesson) => progress[lesson.id] && progress[lesson.id].completed).length;
    const summary = document.getElementById('progress-summary');
    summary.textContent = completed
      ? `${completed} of ${lessons.length} lessons complete. Nice work.`
      : `${lessons.length} short lessons. Start wherever you like.`;
  }

  start().catch((error) => {
    lessonList.replaceChildren();
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = error.message;
    lessonList.append(message);
  });

  window.addEventListener('lacuna-progress-updated', () => {
    start().catch((error) => {
      lessonList.replaceChildren();
      const message = document.createElement('p');
      message.className = 'muted';
      message.textContent = error.message;
      lessonList.append(message);
    });
  });
})();
