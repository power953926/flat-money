import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.5";
const ACCOUNTING_DOC_PATH = ["houseFunds", "default"];

let auth;
let db;
let docRef;
let unsubscribeAuth = null;
let unsubscribeSnapshot = null;
let currentUser = null;
let cloudReady = false;

export function isCloudConfigured() {
  return Boolean(firebaseConfig.enabled && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain && firebaseConfig.appId);
}

export async function initCloudStore({ onAuth, onRemoteState, getLocalState }) {
  if (!isCloudConfigured()) {
    onAuth({ mode: "local", user: null, ready: false });
    return;
  }

  const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
  const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  const firestoreModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);

  const app = appModule.initializeApp(firebaseConfig);
  auth = authModule.getAuth(app);
  db = firestoreModule.getFirestore(app);
  docRef = firestoreModule.doc(db, ...ACCOUNTING_DOC_PATH);

  await authModule.setPersistence(auth, authModule.browserLocalPersistence);

  unsubscribeAuth = authModule.onAuthStateChanged(auth, (user) => {
    currentUser = user;
    cloudReady = Boolean(user);
    onAuth({ mode: "cloud", user, ready: cloudReady });

    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }

    if (!user) return;

    unsubscribeSnapshot = firestoreModule.onSnapshot(docRef, async (snapshot) => {
      if (snapshot.exists()) {
        const remoteState = snapshot.data().state;
        if (remoteState) onRemoteState(remoteState);
        return;
      }

      await saveCloudState(getLocalState());
    });
  });
}

export async function signInToCloud(email, password) {
  const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  return authModule.signInWithEmailAndPassword(auth, email, password);
}

export async function createCloudAccount(email, password) {
  const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  return authModule.createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutFromCloud() {
  const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  return authModule.signOut(auth);
}

export async function saveCloudState(state) {
  if (!cloudReady || !currentUser || !docRef) return;
  const firestoreModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);
  await firestoreModule.setDoc(
    docRef,
    {
      state,
      editors: buildEditors(state),
      updatedAt: firestoreModule.serverTimestamp(),
      updatedBy: currentUser.email || currentUser.uid
    },
    { merge: true }
  );
}

function buildEditors(state) {
  return Object.fromEntries(
    (state.members || [])
      .filter((member) => member.email)
      .map((member) => [member.email, member.id])
  );
}

export function disposeCloudStore() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  if (unsubscribeAuth) unsubscribeAuth();
}
