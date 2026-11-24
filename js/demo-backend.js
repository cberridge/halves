// In-memory backend with the same API as firebase-backend.js.
// Open the app with ?demo to use it: handy for UI work without touching real data.
const me = { uid: 'demo-me', name: 'You', email: 'you@example.com' };
const partner = { uid: 'demo-partner', name: 'Sam' };

let household = { id: 'DEMO-CODE', members: [me.uid, partner.uid], names: { [me.uid]: me.name, [partner.uid]: partner.name } };
const today = new Date();
const iso = (daysAgo) => new Date(today.getTime() - daysAgo * 864e5).toISOString().slice(0, 10);
let entries = [
  { id: 'e1', kind: 'expense', description: 'Weekly shop', amount: 8640, paidBy: me.uid, shares: { [me.uid]: 4320, [partner.uid]: 4320 }, split: { type: 'equal' }, date: iso(1) },
  { id: 'e2', kind: 'expense', description: 'Pizza night', amount: 3150, paidBy: partner.uid, shares: { [me.uid]: 1575, [partner.uid]: 1575 }, split: { type: 'equal' }, date: iso(3) },
  { id: 'e3', kind: 'expense', description: 'Electricity', amount: 12000, paidBy: me.uid, shares: { [me.uid]: 7200, [partner.uid]: 4800 }, split: { type: 'percent', percent: 60, uid: me.uid }, date: iso(12) },
  { id: 'e4', kind: 'settlement', description: 'Settle up', amount: 2000, paidBy: partner.uid, shares: { [me.uid]: 2000 }, date: iso(40) },
];

const authSubs = new Set();
const hhSubs = new Set();
const entrySubs = new Set();
let user = me;
let nextId = 100;

const emitEntries = () => entrySubs.forEach((cb) => cb(entries.map((e) => ({ ...e }))));

export function watchAuth(cb) { authSubs.add(cb); setTimeout(() => cb(user), 0); return () => authSubs.delete(cb); }
export async function signUp(name) { user = { ...me, name }; authSubs.forEach((cb) => cb(user)); return user; }
export async function signIn() { user = me; authSubs.forEach((cb) => cb(user)); return user; }
export async function signOut() { user = null; authSubs.forEach((cb) => cb(null)); }
export async function resetPassword() {}
export function watchHousehold(uid, cb) { hhSubs.add(cb); setTimeout(() => cb(household), 0); return () => hhSubs.delete(cb); }
export async function createHousehold() { return household.id; }
export async function joinHousehold() { return household.id; }
export function watchEntries(hid, cb) { entrySubs.add(cb); setTimeout(emitEntries, 0); return () => entrySubs.delete(cb); }

export async function saveEntry(hid, entry, u) {
  if (entry.id) entries = entries.map((e) => (e.id === entry.id ? { ...e, ...entry } : e));
  else entries = [...entries, { ...entry, id: `e${nextId++}`, createdBy: u.uid }];
  emitEntries();
}

export async function deleteEntry(hid, id) { entries = entries.filter((e) => e.id !== id); emitEntries(); }
