(function () {
  const config = window.FIREBASE_CONFIG || {};
  const configured = ['apiKey', 'authDomain', 'projectId', 'appId']
    .every((key) => typeof config[key] === 'string'
      && config[key].length > 0 && !config[key].startsWith('your-'));
  const toggle = document.getElementById('account-toggle');
  const panel = document.getElementById('account-panel');
  const status = document.getElementById('account-status');
  const message = document.getElementById('account-message');
  const form = document.getElementById('account-form');
  const googleButton = document.getElementById('google-sign-in');
  const createButton = document.getElementById('create-account');
  const signOutButton = document.getElementById('sign-out');
  let auth = null;
  let resolveReady;

  window.LacunaAuthReady = new Promise((resolve) => { resolveReady = resolve; });
  window.LacunaAuth = {
    currentUser: () => auth ? auth.currentUser : null,
    ready: window.LacunaAuthReady,
  };

  function setMessage(text) {
    message.textContent = text;
  }

  function updateAccount(user) {
    if (!toggle) return;
    toggle.textContent = user ? 'Account' : 'Sign in';
    status.textContent = user
      ? `Signed in as ${user.email || 'your account'}. Your progress syncs across devices.`
      : 'Sign in to sync your progress across devices.';
    form.hidden = Boolean(user);
    googleButton.hidden = Boolean(user);
    signOutButton.hidden = !user;
  }

  function friendlyError(error) {
    const messages = {
      'auth/email-already-in-use': 'An account already uses this email. Try signing in instead.',
      'auth/invalid-credential': 'That email or password was not recognized.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase yet.',
      'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
      'auth/weak-password': 'Choose a password with at least 6 characters.',
    };
    return messages[error.code] || 'Sign-in failed. Please try again.';
  }

  async function run(action) {
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open && !auth && !configured) {
        setMessage('Add your Firebase web settings to public/config.js to enable accounts.');
      }
    });
  }

  if (!configured || !window.firebase || !window.firebase.auth) {
    status.textContent = configured
      ? 'The sign-in service did not load. Check your connection and refresh.'
      : 'Accounts are not configured yet. Progress is saved on this device.';
    if (form) form.hidden = true;
    if (googleButton) googleButton.hidden = true;
    resolveReady(null);
    return;
  }

  try {
    const app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(config);
    auth = app.auth();
    window.LacunaAuth.currentUser = () => auth.currentUser;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('account-email').value.trim();
      const passwordInput = document.getElementById('account-password');
      const password = passwordInput.value;
      run(async () => {
        await auth.signInWithEmailAndPassword(email, password);
        passwordInput.value = '';
      });
    });
    createButton.addEventListener('click', () => {
      const email = document.getElementById('account-email').value.trim();
      const passwordInput = document.getElementById('account-password');
      const password = passwordInput.value;
      run(async () => {
        await auth.createUserWithEmailAndPassword(email, password);
        passwordInput.value = '';
      });
    });
    googleButton.addEventListener('click', () => {
      run(() => auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider()));
    });
    signOutButton.addEventListener('click', () => run(() => auth.signOut()));

    let firstState = true;
    auth.onAuthStateChanged(async (user) => {
      updateAccount(user);
      if (firstState) {
        firstState = false;
        resolveReady(user);
      }
      if (user && window.LacunaApi) {
        setMessage('Syncing your learning progress…');
        try {
          await window.LacunaApi.syncAccountData();
          setMessage('');
        } catch (error) {
          setMessage('Signed in, but progress could not sync. It will retry when you are online.');
        }
      }
      window.dispatchEvent(new CustomEvent('lacuna-auth-change', { detail: { user } }));
    }, () => {
      status.textContent = 'Could not check your account. Refresh to try again.';
      if (firstState) {
        firstState = false;
        resolveReady(null);
      }
    });
  } catch (error) {
    console.error(error);
    status.textContent = 'Account sign-in could not be initialized. Check the Firebase configuration.';
    if (form) form.hidden = true;
    if (googleButton) googleButton.hidden = true;
    resolveReady(null);
  }
})();
