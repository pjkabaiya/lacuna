(function () {
  const apiBase = (window.API_BASE || '/api').replace(/\/+$/, '');
  const timeoutMs = 4500;
  let eventFlushPromise = Promise.resolve();

  async function request(path, options) {
    await window.LacunaAuthReady;
    const user = window.LacunaAuth && window.LacunaAuth.currentUser();
    if (!user) throw new Error('Sign in to sync progress.');
    const token = await user.getIdToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options && options.headers),
        },
      });
      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function syncProgress(lessonId, progress) {
    await window.LacunaAuthReady;
    if (!window.LacunaAuth.currentUser()) return null;
    return request('/progress', {
      method: 'POST',
      body: JSON.stringify({
        lessonId,
        stepIndex: progress.stepIndex,
        completed: progress.completed,
        mistakes: progress.mistakes,
      }),
    });
  }

  async function loadProgress() {
    await window.LacunaAuthReady;
    if (!window.LacunaAuth.currentUser()) return null;
    return request('/progress');
  }

  function flushEvents(storage) {
    const result = eventFlushPromise.then(async () => {
      await window.LacunaAuthReady;
      if (!window.LacunaAuth.currentUser()) return;
      let pending = storage.events();
      while (pending.length) {
        const batch = pending.slice(0, 50);
        await request('/events', {
          method: 'POST',
          body: JSON.stringify({ events: batch }),
        });
        pending = pending.slice(batch.length);
        storage.saveEvents(pending);
      }
    });
    eventFlushPromise = result.catch(() => {});
    return result;
  }

  function mergeProgress(local, remote) {
    return {
      ...local,
      ...remote,
      stepIndex: Math.max(local.stepIndex || 0, remote.stepIndex || 0),
      completed: Boolean(local.completed || remote.completed),
      completedAt: local.completedAt || remote.completedAt || null,
      mistakes: Math.max(local.mistakes || 0, remote.mistakes || 0),
    };
  }

  async function syncAccountData() {
    const remote = await loadProgress();
    const local = window.LacunaStorage.progress();
    const lessons = { ...(remote.lessons || {}) };
    Object.keys(local).forEach((lessonId) => {
      lessons[lessonId] = lessons[lessonId]
        ? mergeProgress(local[lessonId], lessons[lessonId])
        : local[lessonId];
    });
    window.LacunaStorage.saveProgress(lessons);
    await Promise.all(Object.entries(lessons)
      .map(([lessonId, progress]) => syncProgress(lessonId, progress)));
    await flushEvents(window.LacunaStorage);
    window.dispatchEvent(new CustomEvent('lacuna-progress-updated', { detail: { lessons } }));
    return lessons;
  }

  window.LacunaApi = { flushEvents, loadProgress, syncAccountData, syncProgress };
})();
