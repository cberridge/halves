// Firebase implementation of the backend interface (see demo-backend.js for the same API in memory).
// Firebase is loaded from Google's CDN so there is no build step. Bump FB_VERSION to upgrade.
import { firebaseConfig } from './config.js';

const FB_VERSION = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

const { initializeApp } = await import(`${CDN}/firebase-app.js`);
const {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut: fbSignOut, updateProfile, sendPasswordResetEmail,
} = await import(`${CDN}/firebase-auth.js`);
const {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, limit,
  serverTimestamp, arrayUnion,
} = await import(`${CDN}/firebase-firestore.js`);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Persistent cache = works offline; writes queue and sync when back online.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const toUser = (u) => (u ? { uid: u.uid, name: u.displayName || u.email.split('@')[0], email: u.email } : null);

export function watchAuth(cb) {
  return onAuthStateChanged(auth, (u) => cb(toUser(u)));
}

export async function signUp(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return toUser(cred.user);
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return toUser(cred.user);
}

export const signOut = () => fbSignOut(auth);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

/** Calls cb(household|null) whenever the user's household changes (e.g. partner joins). */
export function watchHousehold(uid, cb, onError) {
  const q = query(collection(db, 'households'), where('members', 'array-contains', uid), limit(1));
  return onSnapshot(q, (snap) => {
    const d = snap.docs[0];
    cb(d ? { id: d.id, ...d.data() } : null);
  }, onError);
}

export async function createHousehold(user) {
  const ref = doc(collection(db, 'households'));
  await setDoc(ref, { members: [user.uid], names: { [user.uid]: user.name }, createdAt: serverTimestamp() });
  return ref.id;
}

/** The household ID doubles as the invite code. */
export async function joinHousehold(code, user) {
  const ref = doc(db, 'households', code.trim());
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('No shared tab found with that code.');
  const data = snap.data();
  if (data.members.includes(user.uid)) return ref.id;
  if (data.members.length >= 2) throw new Error('That shared tab already has two people.');
  await updateDoc(ref, { members: arrayUnion(user.uid), [`names.${user.uid}`]: user.name });
  return ref.id;
}

export function watchEntries(householdId, cb, onError) {
  return onSnapshot(collection(db, 'households', householdId, 'entries'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

/**
 * Writes resolve only once the server acknowledges them, which never happens offline.
 * So callers should not await these for UI purposes — the snapshot listener updates the UI immediately.
 */
export function saveEntry(householdId, entry, user) {
  const { id, ...data } = entry;
  if (id) {
    return updateDoc(doc(db, 'households', householdId, 'entries', id), { ...data, updatedAt: serverTimestamp() });
  }
  const ref = doc(collection(db, 'households', householdId, 'entries'));
  return setDoc(ref, { ...data, createdBy: user.uid, createdAt: serverTimestamp() });
}

export function deleteEntry(householdId, id) {
  return deleteDoc(doc(db, 'households', householdId, 'entries', id));
}
