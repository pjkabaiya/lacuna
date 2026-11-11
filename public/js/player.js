(function () {
  const $ = (id) => document.getElementById(id);
  const storage = window.LacunaStorage;
  const learnerId = storage.learnerId();
  const params = new URLSearchParams(location.search);
  const lessonId = params.get('id') || '';
  const player = $('player');
  let lesson;
  let progressByLesson = storage.progress();
  let stepIndex = 0;
  let phase = 'choose';
  let selectedValue = '';
  let selectedOption = -1;
  let wrongChoices = new Set();
  let choiceAttempts = 0;
  let typingAttempts = 0;
  let mistakes = 0;
  let revealed = false;
  let stepStartedAt = Date.now();
  let replayMode = false;
  let sentShown = false;
  let nextLesson = null;
  let eventFlush = Promise.resolve();
  let progressSynced = false;
  let eventsSynced = false;
  let storageAvailable = true;
  let progressSyncInFlight = false;
  let progressSyncRequested = false;

  function setSaveStatus(text, offline) {
    const status = $('save-status');
    status.textContent = text;
    status.classList.toggle('offline-status', Boolean(offline));
  }

  function updateSyncStatus() {
    if (!storageAvailable) setSaveStatus('Using this tab for now', true);
    else if (progressSynced && eventsSynced) setSaveStatus('Progress synced', false);
    else setSaveStatus('Saved on this device · syncing later', true);
  }

  function recordStepShown() {
    if (sentShown || !lesson || phase === 'complete') return;
    sentShown = true;
    queueEvent({
      stepId: currentStep().id,
      type: 'shown',
      attempts: 0,
      ms: 0,
    });
  }

  function queueEvent(event) {
    const queued = storage.enqueueEvents([{ ...event, lessonId: lesson.id }]);
    if (!queued) storageAvailable = false;
    eventsSynced = false;
    updateSyncStatus();
    eventFlush = eventFlush.then(() => window.LacunaApi.flushEvents(storage, learnerId))
      .then(() => {
        eventsSynced = true;
        updateSyncStatus();
      })
      .catch(() => {
        eventsSynced = false;
        updateSyncStatus();
      });
  }

  function saveProgress(nextIndex, completed) {
    const existing = progressByLesson[lesson.id] || {};
    const stored = {
      stepIndex: Math.max(existing.stepIndex || 0, nextIndex),
      completed: Boolean(existing.completed || completed),
      completedAt: completed ? (existing.completedAt || new Date().toISOString()) : existing.completedAt || null,
      mistakes: Math.max(existing.mistakes || 0, mistakes),
    };
    progressByLesson = { ...progressByLesson, [lesson.id]: stored };
    const saved = storage.saveProgress(progressByLesson);
    if (!saved) storageAvailable = false;
    progressSynced = false;
    updateSyncStatus();
    syncPending();
  }

  function syncPending() {
    if (!lesson || !navigator.onLine) return;
    const saved = progressByLesson[lesson.id];
    if (!progressSynced && !progressSyncInFlight && saved) {
      progressSyncInFlight = true;
      window.LacunaApi.syncProgress(learnerId, lesson.id, saved)
        .then(() => { progressSynced = !progressSyncRequested; })
        .catch(() => {
          progressSynced = false;
          progressSyncRequested = false;
        })
        .finally(() => {
          progressSyncInFlight = false;
          const retry = progressSyncRequested;
          progressSyncRequested = false;
          updateSyncStatus();
          if (retry) syncPending();
        });
    } else if (!progressSynced && progressSyncInFlight && saved) {
      progressSyncRequested = true;
    }
    if (!eventsSynced && storage.events().length) {
      eventFlush = eventFlush.then(() => window.LacunaApi.flushEvents(storage, learnerId))
        .then(() => { eventsSynced = true; })
        .catch(() => { eventsSynced = false; })
        .then(updateSyncStatus);
    }
  }

  function renderTokenized(text, target) {
    const tokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|\b(?:print|if|else|for|in|def|return|True|False|None)\b|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_]\w*(?=\s*\()|\b[a-zA-Z_]\w*\b)/g;
    let cursor = 0;
    let match;
    while ((match = tokenPattern.exec(text))) {
      target.append(document.createTextNode(text.slice(cursor, match.index)));
      const token = match[0];
      const span = document.createElement('span');
      if (token.startsWith('#')) span.className = 'syntax-comment';
      else if (/^["']/.test(token)) span.className = 'syntax-string';
      else if (/^\d/.test(token)) span.className = 'syntax-number';
      else if (/^(print|if|else|for|in|def|return|True|False|None)$/.test(token)) span.className = 'syntax-function';
      span.textContent = token;
      target.append(span);
      cursor = tokenPattern.lastIndex;
    }
    target.append(document.createTextNode(text.slice(cursor)));
  }

  function currentStep() {
    return lesson.steps[stepIndex];
  }

  function displayedValue(step) {
    if (phase === 'complete') return selectedValue || '?';
    if (phase === 'choose') return selectedValue || '?';
    const inputValue = $('answer-input').value;
    if (step.typeMode === 'recall' && !revealed) return inputValue || '?';
    return inputValue || selectedValue || '?';
  }

  function renderCode() {
    const step = currentStep();
    const panel = $('code-panel');
    panel.replaceChildren();
    step.code.forEach((source, index) => {
      const line = document.createElement('div');
      line.className = `code-line${index === step.code.length - 1 ? ' active-line' : ''}${phase === 'locked' && index === step.code.length - 1 ? ' line-locked' : ''}`;
      const number = document.createElement('span');
      number.className = 'line-number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(index + 1);
      const content = document.createElement('code');
      content.className = 'code-content';

      const marker = source.lastIndexOf('___');
      if (index === step.code.length - 1 && marker !== -1) {
        renderTokenized(source.slice(0, marker), content);
        const blank = document.createElement('span');
        blank.className = 'blank-slot';
        const value = displayedValue(step);
        blank.style.minWidth = `${Math.max(6, step.choices[step.answer].text.length)}ch`;
        blank.textContent = value;
        blank.setAttribute('aria-label', value === '?' ? 'missing code piece' : `code piece: ${value}`);
        if (value !== '?') blank.classList.add('filled');
        content.append(blank);
        renderTokenized(source.slice(marker + 3), content);
      } else {
        renderTokenized(source, content);
      }

      line.append(number, content);
      panel.append(line);
    });
  }

  function updateOutput() {
    const step = currentStep();
    const output = phase === 'locked' ? step.output : (stepIndex > 0 ? lesson.steps[stepIndex - 1].output : '');
    $('step-output').textContent = output || 'Your program output will grow here.';
  }

  function renderProgress() {
    const nav = $('step-progress');
    nav.replaceChildren();
    lesson.steps.forEach((step, index) => {
      const mark = document.createElement('span');
      mark.className = `progress-mark${index < stepIndex || phase === 'complete' ? ' done' : ''}${index === stepIndex && phase !== 'complete' ? ' current' : ''}`;
      mark.setAttribute('aria-label', `Step ${index + 1}${index < stepIndex || phase === 'complete' ? ', complete' : index === stepIndex ? ', current' : ', not started'}`);
      nav.append(mark);
    });
  }

  function updateChoiceButtons() {
    const choices = $('choices');
    choices.replaceChildren();
    const step = currentStep();
    step.choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-button';
      button.disabled = phase !== 'choose' || wrongChoices.has(index);
      if (selectedOption === index && index !== step.answer) button.classList.add('wrong');
      if (selectedOption === index && index === step.answer) button.classList.add('correct');
      const number = document.createElement('span');
      number.className = 'choice-index';
      number.textContent = String(index + 1);
      const text = document.createElement('code');
      text.className = 'choice-text';
      text.textContent = choice.text;
      button.append(number, text);
      button.addEventListener('click', () => choose(index));
      choices.append(button);
    });
  }

  function render() {
    if (phase === 'complete') {
      renderComplete();
      return;
    }
    const step = currentStep();
    $('lesson-title').textContent = lesson.title;
    $('lesson-note').textContent = step.note;
    $('step-count').textContent = `Line ${stepIndex + 1} of ${lesson.steps.length}`;
    $('course-title').textContent = 'Python basics';
    $('choices').hidden = phase !== 'choose';
    $('type-area').hidden = phase !== 'type';
    $('step-work').hidden = false;
    $('complete-panel').hidden = true;
    $('feedback').textContent = '';
    $('feedback').classList.remove('success');
    $('continue-step').hidden = phase !== 'locked';
    $('try-again').hidden = phase !== 'choose' || selectedOption < 0 || selectedOption === step.answer;
    $('next-step').hidden = true;
    $('next-lesson-footer').hidden = true;
    $('footer-hint').hidden = false;
    $('show-answer').hidden = true;
    $('copy-answer').textContent = '';
    $('answer-input').value = '';
    $('answer-input').disabled = false;
    $('check-answer').disabled = false;
    if (phase === 'type') {
      $('type-label').textContent = 'Correct. Now type it yourself.';
      $('copy-answer').textContent = step.typeMode === 'copy' ? 'Copy this: ' : 'Try from memory. You can ask to see the answer after two tries.';
      if (step.typeMode === 'copy') {
        const code = document.createElement('code');
        code.textContent = selectedValue;
        $('copy-answer').append(code);
      }
    }
    renderCode();
    updateChoiceButtons();
    updateOutput();
    renderProgress();
  }

  function renderComplete() {
    phase = 'complete';
    stepIndex = lesson.steps.length - 1;
    selectedValue = lesson.steps[stepIndex].choices[lesson.steps[stepIndex].answer].text;
    $('lesson-title').textContent = lesson.title;
    $('lesson-note').textContent = 'You learned one idea at a time and built a complete program.';
    $('step-count').textContent = 'Lesson complete';
    $('step-work').hidden = true;
    $('complete-panel').hidden = false;
    $('complete-copy').textContent = 'Every line is yours. Press Run to see the finished output.';
    $('run-program').hidden = false;
    $('final-output-panel').hidden = true;
    $('final-output').textContent = '';
    $('next-lesson').href = nextLessonUrl();
    $('next-lesson').textContent = nextLessonText();
    $('next-lesson-footer').href = nextLessonUrl();
    $('next-lesson-footer').textContent = nextLessonText();
    $('next-lesson-footer').hidden = false;
    $('continue-step').hidden = true;
    $('try-again').hidden = true;
    $('footer-hint').hidden = true;
    renderProgress();
    renderCode();
  }

  function nextLessonUrl() {
    return nextLesson ? `lesson.html?id=${encodeURIComponent(nextLesson.id)}` : 'index.html#lessons';
  }

  function nextLessonText() {
    return nextLesson ? `Next lesson: ${nextLesson.title}` : 'Back to lessons';
  }

  function setFeedback(text, success) {
    const feedback = $('feedback');
    feedback.textContent = text;
    feedback.classList.toggle('success', Boolean(success));
  }

  function choose(index) {
    if (phase !== 'choose') return;
    const step = currentStep();
    const correct = index === step.answer;
    choiceAttempts += 1;
    selectedOption = index;
    selectedValue = step.choices[index].text;
    queueEvent({
      stepId: step.id,
      type: 'choice',
      correct,
      option: index,
      attempts: choiceAttempts,
      ms: Math.min(Date.now() - stepStartedAt, 3600000),
    });
    if (!correct) {
      wrongChoices.add(index);
      mistakes += 1;
      saveProgress(stepIndex, false);
      setFeedback(step.choices[index].why, false);
    } else {
      $('choices').hidden = true;
      if (step.typeMode === 'none') {
        phase = 'locked';
        setFeedback(step.explain, true);
        saveProgress(stepIndex + 1, stepIndex === lesson.steps.length - 1);
      } else {
        phase = 'type';
        setFeedback(step.explain, true);
      }
    }
    renderCode();
    updateChoiceButtons();
    $('type-area').hidden = phase !== 'type';
    $('continue-step').hidden = phase !== 'locked';
    $('try-again').hidden = correct;
    updateOutput();
    if (phase === 'type') {
      $('type-label').textContent = 'Correct. Now type it yourself.';
      $('copy-answer').replaceChildren();
      if (step.typeMode === 'copy') {
        $('copy-answer').append(document.createTextNode('Copy this: '));
        const code = document.createElement('code');
        code.textContent = selectedValue;
        $('copy-answer').append(code);
      } else {
        $('copy-answer').textContent = 'Try from memory. The answer stays hidden while you type.';
      }
      $('answer-input').focus();
    }
    renderProgress();
  }

  function expectedTyped(step) {
    const code = step.code[step.code.length - 1];
    if (step.typeScope === 'line') return code.replace('___', selectedValue);
    return selectedValue;
  }

  function checkTyping() {
    if (phase !== 'type') return;
    const step = currentStep();
    const expected = expectedTyped(step);
    const typed = $('answer-input').value;
    typingAttempts += 1;
    const message = window.LacunaValidate.diagnose(typed, expected);
    const correct = window.LacunaValidate.matches(typed, expected);
    queueEvent({
      stepId: step.id,
      type: 'type',
      correct,
      attempts: typingAttempts,
      ms: Math.min(Date.now() - stepStartedAt, 3600000),
    });
    if (!correct) {
      mistakes += 1;
      saveProgress(stepIndex, false);
      setFeedback(message, false);
      $('show-answer').hidden = typingAttempts < 2;
      return;
    }
    phase = 'locked';
    revealed = false;
    $('answer-input').disabled = true;
    $('check-answer').disabled = true;
    $('show-answer').hidden = true;
    setFeedback(message ? `Line locked in. ${message}` : 'Line locked in. Nice work: you typed the code yourself.', true);
    saveProgress(stepIndex + 1, stepIndex === lesson.steps.length - 1);
    renderCode();
    updateOutput();
    if (stepIndex === lesson.steps.length - 1) {
      window.setTimeout(renderComplete, 180);
    } else {
      $('continue-step').hidden = false;
    }
  }

  function showAnswer() {
    if (phase !== 'type' || typingAttempts < 2) return;
    const step = currentStep();
    const answer = expectedTyped(step);
    revealed = true;
    $('answer-input').value = answer;
    $('show-answer').hidden = true;
    setFeedback('Here it is. Take a look, then check it to lock in the line.', true);
    queueEvent({
      stepId: step.id,
      type: 'reveal',
      correct: false,
      attempts: typingAttempts,
      ms: Math.min(Date.now() - stepStartedAt, 3600000),
    });
    renderCode();
    $('answer-input').focus();
  }

  function continueStep() {
    if (phase !== 'locked') return;
    if (stepIndex >= lesson.steps.length - 1) {
      saveProgress(lesson.steps.length, true);
      renderComplete();
      return;
    }
    stepIndex += 1;
    phase = 'choose';
    selectedValue = '';
    selectedOption = -1;
    wrongChoices = new Set();
    choiceAttempts = 0;
    typingAttempts = 0;
    revealed = false;
    sentShown = false;
    stepStartedAt = Date.now();
    render();
    recordStepShown();
  }

  function retryChoice() {
    if (phase !== 'choose') return;
    selectedValue = '';
    selectedOption = -1;
    render();
  }

  function insertHelperKey(key) {
    const input = $('answer-input');
    const start = input.selectionStart === null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd === null ? input.value.length : input.selectionEnd;
    input.value = `${input.value.slice(0, start)}${key}${input.value.slice(end)}`;
    input.focus();
    input.setSelectionRange(start + key.length, start + key.length);
    renderCode();
  }

  function replay() {
    stepIndex = 0;
    phase = 'choose';
    selectedValue = '';
    selectedOption = -1;
    wrongChoices = new Set();
    choiceAttempts = 0;
    typingAttempts = 0;
    revealed = false;
    sentShown = false;
    replayMode = true;
    stepStartedAt = Date.now();
    render();
    recordStepShown();
  }

  function mergeRemoteProgress(remote) {
    const saved = progressByLesson[lesson.id] || {};
    const server = remote && remote.lessons && remote.lessons[lesson.id];
    if (!server) return saved;
    const merged = {
      stepIndex: Math.max(saved.stepIndex || 0, server.stepIndex || 0),
      completed: Boolean(saved.completed || server.completed),
      completedAt: saved.completedAt || server.completedAt || null,
      mistakes: Math.max(saved.mistakes || 0, server.mistakes || 0),
    };
    progressByLesson = { ...progressByLesson, [lesson.id]: merged };
    if (!storage.saveProgress(progressByLesson)) storageAvailable = false;
    if (!replayMode && (merged.completed || merged.stepIndex > stepIndex)) {
      if (merged.completed || merged.stepIndex >= lesson.steps.length) {
        phase = 'complete';
      } else {
        stepIndex = merged.stepIndex;
        sentShown = false;
      }
      mistakes = merged.mistakes;
      render();
      if (phase !== 'complete') recordStepShown();
    }
    return merged;
  }

  async function loadLesson() {
    try {
      if (!/^[a-z0-9-]{1,80}$/.test(lessonId)) throw new Error('Choose a lesson from the lesson list to begin.');
      const response = await fetch(`lessons/${encodeURIComponent(lessonId)}.json`);
      if (!response.ok) throw new Error('This lesson could not be found. Please choose another one.');
      lesson = await response.json();
      if (!Array.isArray(lesson.steps) || lesson.steps.length < 6) throw new Error('This lesson is missing its practice steps.');
      const manifestResponse = await fetch('lessons/index.json');
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        const ordered = manifest.lessons.slice().sort((a, b) => a.order - b.order);
        const current = ordered.findIndex((entry) => entry.id === lesson.id);
        nextLesson = current >= 0 ? ordered[current + 1] || null : null;
      }
      document.title = `${lesson.title} — lacuna`;
      const saved = progressByLesson[lesson.id] || {};
      mistakes = saved.mistakes || 0;
      stepIndex = saved.completed ? 0 : Math.min(saved.stepIndex || 0, lesson.steps.length - 1);
      if (saved.completed) phase = 'complete';
      player.setAttribute('aria-busy', 'false');
      render();
      recordStepShown();

      window.LacunaApi.loadProgress(learnerId)
        .then((remote) => {
          const merged = mergeRemoteProgress(remote);
          if (merged && Number.isInteger(merged.stepIndex)) {
            return window.LacunaApi.syncProgress(learnerId, lesson.id, merged);
          }
          return null;
        })
        .then(() => {
          progressSynced = true;
          updateSyncStatus();
        })
        .catch(() => {
          progressSynced = false;
          updateSyncStatus();
        });
      eventFlush = eventFlush.then(() => window.LacunaApi.flushEvents(storage, learnerId))
        .then(() => {
          eventsSynced = true;
          updateSyncStatus();
        })
        .catch(() => {
          eventsSynced = false;
          updateSyncStatus();
        });
    } catch (error) {
      player.setAttribute('aria-busy', 'false');
      $('lesson-title').textContent = 'Lesson unavailable';
      $('lesson-note').textContent = error.message;
      $('step-count').textContent = '';
      $('code-panel').hidden = true;
      $('step-work').hidden = true;
      $('footer-hint').textContent = 'Back to lessons';
      $('footer-hint').onclick = () => { location.href = 'index.html#lessons'; };
    }
  }

  $('check-answer').addEventListener('click', checkTyping);
  $('answer-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      checkTyping();
    }
  });
  $('answer-input').addEventListener('input', renderCode);
  document.querySelectorAll('.helper-keys button').forEach((button) => {
    button.addEventListener('click', () => insertHelperKey(button.dataset.key));
  });
  $('show-answer').addEventListener('click', showAnswer);
  $('continue-step').addEventListener('click', continueStep);
  $('try-again').addEventListener('click', retryChoice);
  $('next-step').addEventListener('click', continueStep);
  $('run-program').addEventListener('click', () => {
    $('final-output').textContent = lesson.finalOutput;
    $('final-output-panel').hidden = false;
    $('run-program').hidden = true;
  });
  $('replay-lesson').addEventListener('click', replay);
  $('footer-hint').addEventListener('click', () => {
    if (phase === 'choose') setFeedback('Take another look at the note card. One small idea is enough for this line.', false);
    else if (phase === 'type') setFeedback('You already found the right code. Try typing it slowly; spacing around operators is flexible.', false);
  });

  window.addEventListener('online', syncPending);
  window.setInterval(syncPending, 30000);
  loadLesson();
})();
