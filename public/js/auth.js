(function () {
  const config = window.FIREBASE_CONFIG || {};
  const apiKeyLooksValid = typeof config.apiKey === 'string'
    && /^AIza[0-9A-Za-z_-]{30,}$/.test(config.apiKey);
  const configured = apiKeyLooksValid
    && ['authDomain', 'projectId', 'appId'].every((key) => typeof config[key] === 'string'
      && config[key].length > 0 && !config[key].startsWith('your-'));
  const toggle = document.getElementById('account-toggle');
  const panel = document.getElementById('account-panel');
  const accountStatus = document.getElementById('account-status');
  const signOutButton = document.getElementById('sign-out');
  const authForm = document.getElementById('auth-form');
  const authMessage = document.getElementById('auth-message');
  const authStatus = document.getElementById('auth-status');
  const googleButton = document.getElementById('google-sign-in');
  const forgotButton = document.getElementById('forgot-password');
  const modeButton = document.getElementById('auth-mode-toggle');
  const passwordInput = document.getElementById('auth-password');
  let auth = null;
  let resolveReady;
  let creatingAccount = false;

  window.LacunaAuthReady = new Promise((resolve) => { resolveReady = resolve; });
  window.LacunaAuth = {
    currentUser: () => auth ? auth.currentUser : null,
    ready: window.LacunaAuthReady,
  };

  function setAuthMessage(text) {
    if (authMessage) authMessage.textContent = text;
  }

  function safeReturnUrl() {
    const requested = new URLSearchParams(location.search).get('next') || 'index.html#lessons';
    const target = new URL(requested, location.origin);
    if (target.origin !== location.origin) return new URL('index.html#lessons', location.origin);
    return target;
  }

  function setMode(create) {
    creatingAccount = create;
    if (!authForm) return;
    document.getElementById('auth-heading').textContent = create ? 'Create your account.' : 'Welcome back.';
    document.getElementById('auth-description').textContent = create
      ? 'Save your learning progress and pick up anywhere.'
      : 'Sign in to sync your progress across devices.';
    document.getElementById('auth-submit').textContent = create ? 'Create account' : 'Sign in with email';
    document.getElementById('auth-switch-copy').textContent = create ? 'Already have an account?' : 'New to lacuna?';
    modeButton.textContent = create ? 'Sign in' : 'Create an account';
    passwordInput.autocomplete = create ? 'new-password' : 'current-password';
    forgotButton.hidden = create;
    setAuthMessage('');
  }

  function updateAccount(user) {
    if (toggle) {
      if (user) {
        toggle.textContent = 'Account';
        toggle.href = '#account-panel';
      } else {
        toggle.textContent = 'Sign in';
        const next = `${location.pathname}${location.search}${location.hash}`;
        toggle.href = `auth.html?next=${encodeURIComponent(next)}`;
      }
    }
    if (accountStatus) {
      accountStatus.textContent = user
        ? `Signed in as ${user.email || 'your account'}. Your progress syncs across devices.`
        : 'Sign in to sync your progress across devices.';
    }
    if (signOutButton) signOutButton.hidden = !user;
    if (panel && !user) panel.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', String(Boolean(user && panel && !panel.hidden)));
  }

  function firebaseErrorMessage(error) {
    const messages = {
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
        'Firebase rejected the web API key. Replace it in public/config.js with the Web API key from Firebase Console → Project settings → General → Your apps.',
      'auth/configuration-not-found':
        'Firebase Authentication is not configured for this project. Enable Email/Password and Google in Firebase Console.',
      'auth/email-already-in-use': 'An account already uses this email. Try signing in instead.',
      'auth/invalid-api-key':
        'Firebase rejected the web API key. Replace it in public/config.js with the Web API key from Firebase Console → Project settings → General → Your apps.',
      'auth/invalid-credential': 'That email or password was not recognized.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
      'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups and try again.',
      'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
      'auth/unauthorized-domain':
        'This site is not authorized by Firebase. Add its domain in Firebase Console → Authentication → Settings → Authorized domains.',
      'auth/user-disabled': 'This account has been disabled. Contact the site administrator.',
      'auth/weak-password': 'Choose a password with at least 6 characters.',
    };
    return messages[error.code] || 'Sign-in failed. Check your details and try again.';
  }

  async function completeSignIn(action) {
    setAuthMessage('');
    if (authStatus) authStatus.textContent = '';
    try {
      await action();
      location.replace(safeReturnUrl().href);
    } catch (error) {
      const message = firebaseErrorMessage(error);
      setAuthMessage(message);
      if (authStatus) authStatus.textContent = message;
    }
  }

  if (toggle && panel) {
    toggle.addEventListener('click', (event) => {
      if (!auth || !auth.currentUser) return;
      event.preventDefault();
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
  }

  if (signOutButton) {
    signOutButton.addEventListener('click', async () => {
      try {
        await auth.signOut();
        if (panel) panel.hidden = true;
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      } catch (error) {
        if (accountStatus) accountStatus.textContent = 'Could not sign out. Please try again.';
      }
    });
  }

  if (!configured) {
    const message = 'Firebase API key is missing or invalid. Add the Web API key for this Firebase project to public/config.js.';
    if (authStatus) authStatus.textContent = message;
    if (authForm) authForm.querySelectorAll('input, button').forEach((control) => { control.disabled = true; });
    if (googleButton) googleButton.disabled = true;
    if (forgotButton) forgotButton.disabled = true;
    resolveReady(null);
    return;
  }

  if (!window.firebase || !window.firebase.auth) {
    const message = 'Firebase sign-in did not load. Check your connection, then refresh.';
    if (authStatus) authStatus.textContent = message;
    if (authForm) authForm.querySelectorAll('input, button').forEach((control) => { control.disabled = true; });
    if (googleButton) googleButton.disabled = true;
    if (forgotButton) forgotButton.disabled = true;
    resolveReady(null);
    return;
  }

  try {
    const app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(config);
    auth = app.auth();
    window.LacunaAuth.currentUser = () => auth.currentUser;

    if (authForm) {
      authForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const password = passwordInput.value;
        const action = creatingAccount
          ? () => auth.createUserWithEmailAndPassword(email, password)
          : () => auth.signInWithEmailAndPassword(email, password);
        completeSignIn(action);
      });

      modeButton.addEventListener('click', () => setMode(!creatingAccount));
      forgotButton.addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value.trim();
        if (!email) {
          setAuthMessage('Enter your email address first, then choose Forgot password.');
          document.getElementById('auth-email').focus();
          return;
        }
        try {
          await auth.sendPasswordResetEmail(email);
          setAuthMessage('Password reset instructions have been sent if an account exists for that email.');
        } catch (error) {
          setAuthMessage(firebaseErrorMessage(error));
        }
      });

      document.getElementById('toggle-password').addEventListener('click', (event) => {
        const reveal = passwordInput.type === 'password';
        passwordInput.type = reveal ? 'text' : 'password';
        event.currentTarget.textContent = reveal ? 'Hide' : 'Show';
        event.currentTarget.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
      });
    }

    if (googleButton) {
      googleButton.addEventListener('click', () => completeSignIn(
        () => auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider()),
      ));
    }

    let firstState = true;
    auth.onAuthStateChanged(async (user) => {
      updateAccount(user);
      if (firstState) {
        firstState = false;
        resolveReady(user);
        if (user && authForm) {
          location.replace(safeReturnUrl().href);
          return;
        }
      }
      if (user && window.LacunaApi) {
        try {
          await window.LacunaApi.syncAccountData();
        } catch (error) {
          if (authStatus) authStatus.textContent = 'Signed in, but progress could not sync. It will retry when you are online.';
        }
      }
      window.dispatchEvent(new CustomEvent('lacuna-auth-change', { detail: { user } }));
    }, (error) => {
      const message = firebaseErrorMessage(error);
      if (authStatus) authStatus.textContent = message;
      if (accountStatus) accountStatus.textContent = message;
      if (firstState) {
        firstState = false;
        resolveReady(null);
      }
    });
  } catch (error) {
    const message = firebaseErrorMessage(error);
    if (authStatus) authStatus.textContent = message;
    resolveReady(null);
  }
})();
