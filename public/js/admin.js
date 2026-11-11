(function () {
  const api = (window.API_BASE || '/api').replace(/\/+$/, '');
  const keyInput = document.getElementById('admin-key');
  const button = document.getElementById('load-button');
  const message = document.getElementById('message');
  const statsSection = document.getElementById('stats');

  function makeCell(value, tag) {
    const cell = document.createElement(tag || 'td');
    if (value instanceof Node) cell.append(value);
    else cell.textContent = String(value);
    return cell;
  }

  function makeTable(headers, rows) {
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach((header) => headerRow.append(makeCell(header, 'th')));
    head.append(headerRow);
    const body = document.createElement('tbody');
    rows.forEach((values) => {
      const row = document.createElement('tr');
      values.forEach((value) => row.append(makeCell(value)));
      body.append(row);
    });
    table.append(head, body);
    return table;
  }

  function showStats(data) {
    const summary = document.getElementById('summary');
    summary.replaceChildren();
    [
      ['Unique learners', data.uniqueLearners],
      ['Lessons tracked', data.lessons.length],
      ['Steps tracked', data.hardestSteps.length],
    ].forEach(([label, count]) => {
      const card = document.createElement('div');
      card.className = 'stats-card';
      const value = document.createElement('strong');
      value.textContent = String(count);
      const caption = document.createElement('span');
      caption.textContent = label;
      card.append(value, caption);
      summary.append(card);
    });

    const completionRows = data.lessons.map((lesson) => [
      lesson.lessonId,
      lesson.learners,
      lesson.completed,
      `${Math.round(lesson.completionRate * 100)}%`,
    ]);
    document.getElementById('completion-list').replaceChildren(
      completionRows.length
        ? makeTable(['Lesson', 'Started', 'Completed', 'Completion'], completionRows)
        : Object.assign(document.createElement('p'), { className: 'admin-empty', textContent: 'No lesson progress yet.' }),
    );

    const hardRows = data.hardestSteps.map((step) => [
      `${step.lessonId} / ${step.stepId}`,
      step.shown,
      step.wrongChoice,
      step.correctChoice,
      step.typeFails,
      step.revealUsed,
    ]);
    document.getElementById('hardest-list').replaceChildren(
      hardRows.length
        ? makeTable(['Lesson / step', 'Shown', 'Wrong picks', 'Right picks', 'Typing fails', 'Answers shown'], hardRows)
        : Object.assign(document.createElement('p'), { className: 'admin-empty', textContent: 'No step activity yet.' }),
    );

    const optionRows = data.mostPickedWrongOptions.map((option) => [
      `${option.lessonId} / ${option.stepId}`,
      `Option ${option.option + 1}`,
      option.count,
    ]);
    document.getElementById('options-list').replaceChildren(
      optionRows.length
        ? makeTable(['Lesson / step', 'Distractor', 'Picked'], optionRows)
        : Object.assign(document.createElement('p'), { className: 'admin-empty', textContent: 'No wrong options recorded yet.' }),
    );
    statsSection.hidden = false;
  }

  document.getElementById('key-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    statsSection.hidden = true;
    message.textContent = 'Loading learning stats…';
    try {
      const response = await fetch(`${api}/admin?view=stats`, {
        headers: { 'x-admin-key': keyInput.value },
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? 'Admin key was not accepted.' : data.error || 'Stats could not be loaded.');
      showStats(data);
      message.textContent = 'Stats loaded.';
    } catch (error) {
      message.textContent = error.name === 'TimeoutError'
        ? 'The stats service is taking too long to wake up. Try again in a moment.'
        : error.message || 'The stats service could not be reached.';
    } finally {
      button.disabled = false;
    }
  });
})();
