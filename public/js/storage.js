(function () {
  const PROGRESS_KEY = 'lacuna:progress';
  const LEARNER_KEY = 'lacuna:learnerId';
  const EVENTS_KEY = 'lacuna:events';
  const memory = { progress: {}, events: [], learnerId: '' };

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return key === PROGRESS_KEY ? memory.progress : key === EVENTS_KEY ? memory.events : fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      if (key === PROGRESS_KEY) memory.progress = value;
      if (key === EVENTS_KEY) memory.events = value;
      return false;
    }
  }

  function learnerId() {
    try {
      let id = localStorage.getItem(LEARNER_KEY);
      if (!id) {
        id = `l_${crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`;
        localStorage.setItem(LEARNER_KEY, id);
      }
      return id;
    } catch (error) {
      if (!memory.learnerId) memory.learnerId = `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      return memory.learnerId;
    }
  }

  window.LacunaStorage = {
    learnerId,
    progress: () => {
      const progress = readJson(PROGRESS_KEY, memory.progress);
      return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : memory.progress;
    },
    saveProgress(progress) {
      return writeJson(PROGRESS_KEY, progress);
    },
    events: () => {
      const events = readJson(EVENTS_KEY, memory.events);
      return Array.isArray(events) ? events : memory.events;
    },
    saveEvents(events) {
      return writeJson(EVENTS_KEY, events);
    },
    enqueueEvents(events) {
      const pending = this.events();
      pending.push(...events);
      return this.saveEvents(pending.slice(-500));
    },
  };
})();
