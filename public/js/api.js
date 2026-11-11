(function () {
  const apiBase = (window.API_BASE || '/api').replace(/\/+$/, '');
  const timeoutMs = 4500;

  async function request(path, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
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

  async function syncProgress(learnerId, lessonId, progress) {
    return request('/progress', {
      method: 'POST',
      body: JSON.stringify({
        learnerId,
        lessonId,
        stepIndex: progress.stepIndex,
        completed: progress.completed,
        mistakes: progress.mistakes,
      }),
    });
  }

  async function loadProgress(learnerId) {
    const query = new URLSearchParams({ learnerId });
    return request(`/progress?${query}`);
  }

  async function flushEvents(storage, learnerId) {
    const pending = storage.events();
    if (!pending.length) return;
    const batch = pending.slice(0, 50);
    await request('/events', {
      method: 'POST',
      body: JSON.stringify({ learnerId, events: batch }),
    });
    storage.saveEvents(pending.slice(batch.length));
    if (pending.length > batch.length) return flushEvents(storage, learnerId);
  }

  window.LacunaApi = { flushEvents, loadProgress, syncProgress };
})();
