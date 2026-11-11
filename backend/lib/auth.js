const admin = require('firebase-admin');

function createAuthMiddleware(verifyIdToken) {
  return async (req, res, next) => {
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer (.+)$/i);
    if (!match) return res.status(401).json({ error: 'unauthorized' });

    try {
      req.auth = await verifyIdToken(match[1]);
      return next();
    } catch (error) {
      if (error && typeof error.code === 'string'
        && error.code.startsWith('auth/') && error.code !== 'auth/not-configured') {
        return res.status(401).json({ error: 'unauthorized' });
      }
      console.error(error);
      return res.status(503).json({ error: 'auth_unavailable' });
    }
  };
}

function firebaseAuth() {
  if (!admin.apps.length) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
      const error = new Error('Firebase Admin credentials are not configured');
      error.code = 'auth/not-configured';
      throw error;
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      projectId: FIREBASE_PROJECT_ID,
    });
  }
  return admin.auth();
}

const requireAuth = createAuthMiddleware((token) => firebaseAuth().verifyIdToken(token));

module.exports = { createAuthMiddleware, requireAuth };
