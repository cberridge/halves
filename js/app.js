import { parsePence, formatPence, computeShares, computeBalances, summarise, settlementShares } from './money.js';
import { isConfigured } from './config.js';

const DEMO = new URLSearchParams(location.search).has('demo');
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// ---------- State ----------
const state = {
  user: undefined, // undefined = loading, null = signed out
  household: undefined,
  entries: [],
  authMode: 'signin',
  busy: false,
};
let backend;
let unsubHousehold = () => {};
let unsubEntries = () => {};

// Remember an invite link (?join=CODE) across the sign-up flow.
const params = new URLSearchParams(location.search);
if (params.get('join')) {
  sessionStorage.setItem('pendingJoin', params.get('join'));
  params.delete('join');
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

// ---------- Helpers ----------
const partnerOf = (hh, uid) => hh.members.find((m) => m !== uid);
const nameOf = (uid) => (uid === state.user?.uid ? 'You' : state.household?.names?.[uid] || 'Partner');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function friendlyError(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/email-already-in-use': 'There’s already an account with that email. Try signing in.',
    'auth/weak-password': 'Use a password of at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'You appear to be offline.',
    'permission-denied': 'You don’t have permission to do that.',
  };
  return map[code] || err?.message || 'Something went wrong.';
}

// Fire-and-forget writes: Firestore updates the UI from its local cache straight away,
// and the promise only settles once the server confirms (never, while offline).
function write(promise, okMsg) {
  if (okMsg) toast(okMsg);
  promise.catch((err) => toast(friendlyError(err)));
}

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const parseDate = (iso) => new Date(`${iso}T12:00:00`);

// ---------- Rendering ----------
function render() {
  const root = $('#app');
  if (!DEMO && !isConfigured) return (root.innerHTML = notConfiguredView());
  if (state.user === undefined || (state.user && state.household === undefined)) {
    return (root.innerHTML = '<div class="center muted">Loading…</div>');
  }
  if (!state.user) return (root.innerHTML = authView());
  if (!state.household) return (root.innerHTML = setupView());
  root.innerHTML = mainView();
}

function notConfiguredView() {
  return `
    <section class="card onboarding">
      <h1>Almost there</h1>
      <p>Add your Firebase settings to <code>js/config.js</code> to start using Halves. The README walks you through it.</p>
      <p><a class="btn" href="?demo">Try the demo</a></p>
    </section>`;
}

function authView() {
  const signup = state.authMode === 'signup';
  return `
    <section class="onboarding">
      <div class="brand"><img src="icons/icon.svg" alt="" width="64" height="64"><h1>Halves</h1></div>
      <p class="muted">Split bills between two, without the spreadsheet.</p>
      <form id="auth-form" class="card stack" novalidate>
        ${signup ? `<label class="field"><span>Your first name</span><input name="name" autocomplete="given-name" required></label>` : ''}
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></label>
        <p class="error" id="auth-error" role="alert"></p>
        <button class="btn wide" type="submit" ${state.busy ? 'disabled' : ''}>${signup ? 'Create account' : 'Sign in'}</button>
        ${signup ? '' : '<button class="link small" type="button" data-action="reset-password">Forgot password?</button>'}
      </form>
      <p class="center small">${signup ? 'Already have an account?' : 'New here?'}
        <button class="link" data-action="toggle-auth">${signup ? 'Sign in' : 'Create an account'}</button></p>
    </section>`;
}

function setupView() {
  const pending = sessionStorage.getItem('pendingJoin') || '';
  return `
    <section class="onboarding">
      <h1>Hi ${esc(state.user.name)}</h1>
      <p class="muted">Halves keeps one shared tab between two people.</p>
      <form id="join-form" class="card stack" novalidate>
        <h2>Join your partner</h2>
        <label class="field"><span>Invite code</span><input name="code" value="${esc(pending)}" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>
        <p class="error" id="join-error" role="alert"></p>
        <button class="btn wide" type="submit" ${state.busy ? 'disabled' : ''}>Join</button>
      </form>
      <div class="divider"><span>or</span></div>
      <div class="card stack">
        <h2>Start a new shared tab</h2>
        <p class="muted small">You'll get a link to send to your partner.</p>
        <button class="btn secondary wide" data-action="create-household" ${state.busy ? 'disabled' : ''}>Start</button>
      </div>
      <p class="center small"><button class="link" data-action="sign-out">Sign out</button></p>
    </section>`;
}

function mainView() {
  const hh = state.household;
  const me = state.user.uid;
  const partner = partnerOf(hh, me);
  const ready = Boolean(partner);
  const summary = ready ? summarise(computeBalances(state.entries, hh.members)) : null;

  let balanceHtml;
  if (!ready) balanceHtml = `<p class="balance-label">Waiting for your partner to join</p>`;
  else if (!summary) balanceHtml = `<p class="balance-label">You're all settled up</p><p class="balance-amount settled">✓</p>`;
  else if (summary.from === me) balanceHtml = `<p class="balance-label">You owe ${esc(nameOf(partner))}</p><p class="balance-amount owe">${formatPence(summary.amount)}</p>`;
  else balanceHtml = `<p class="balance-label">${esc(nameOf(partner))} owes you</p><p class="balance-amount owed">${formatPence(summary.amount)}</p>`;

  return `
    <header class="topbar">
      <h1>Halves</h1>
      <button class="icon-btn" data-action="open-menu" aria-label="Settings">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>
    </header>
    <section class="balance card">
      ${balanceHtml}
      ${ready && summary ? `<button class="btn secondary" data-action="settle">Settle up</button>` : ''}
    </section>
    ${ready ? '' : inviteCard()}
    ${installHint()}
    <section class="history">${ready ? historyView() : ''}</section>
    ${ready ? `<button class="fab" data-action="add-expense" aria-label="Add expense"><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg><span>Add expense</span></button>` : ''}
  `;
}

function inviteLink() {
  return `${location.origin}${location.pathname}?join=${encodeURIComponent(state.household.id)}`;
}

function inviteCard() {
  return `
    <section class="card stack invite">
      <h2>Invite your partner</h2>
      <p class="muted small">Send them this link. Once they've joined, you can start adding expenses.</p>
      <code class="code">${esc(state.household.id)}</code>
      <button class="btn wide" data-action="share-invite">Share invite link</button>
    </section>`;
}

function installHint() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone || localStorage.getItem('hideInstallHint')) return '';
  if (ios) {
    return `<aside class="hint">Install Halves: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>. <button class="link small" data-action="hide-hint">Dismiss</button></aside>`;
  }
  if (deferredInstall) {
    return `<aside class="hint">Install Halves on this device. <button class="link small" data-action="install">Install</button> <button class="link small" data-action="hide-hint">Dismiss</button></aside>`;
  }
  return '';
}

function historyView() {
  const me = state.user.uid;
  const sorted = [...state.entries].sort((a, b) =>
    b.date.localeCompare(a.date) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  if (!sorted.length) {
    return `<div class="empty"><p>No expenses yet.</p><p class="muted small">Tap <strong>Add expense</strong> to record your first one.</p></div>`;
  }

  let html = '';
  let month = '';
  for (const e of sorted) {
    const m = monthFmt.format(parseDate(e.date));
    if (m !== month) {
      if (month) html += '</ul>';
      html += `<h3 class="month">${m}</h3><ul class="list">`;
      month = m;
    }
    html += e.kind === 'settlement' ? settlementRow(e, me) : expenseRow(e, me);
  }
  return `${html}</ul>`;
}

function expenseRow(e, me) {
  const iPaid = e.paidBy === me;
  const partnerShare = Object.entries(e.shares).filter(([u]) => u !== me).reduce((s, [, v]) => s + v, 0);
  const myShare = e.shares[me] || 0;
  const net = iPaid ? partnerShare : myShare;
  const right = net === 0
    ? `<span class="muted small">no balance</span>`
    : `<span class="small ${iPaid ? 'owed' : 'owe'}">${iPaid ? 'you lent' : 'you borrowed'}</span><strong class="${iPaid ? 'owed' : 'owe'}">${formatPence(net)}</strong>`;
  return `
    <li><button class="entry" data-action="edit" data-id="${esc(e.id)}">
      <span class="date">${dayFmt.format(parseDate(e.date)).replace(' ', '<br>')}</span>
      <span class="what"><strong>${esc(e.description)}</strong><span class="muted small">${iPaid ? 'You' : esc(nameOf(e.paidBy))} paid ${formatPence(e.amount)}${splitLabel(e)}</span></span>
      <span class="net">${right}</span>
    </button></li>`;
}

function splitLabel(e) {
  if (!e.split || e.split.type === 'equal') return '';
  const me = state.user.uid;
  return ` · you ${formatPence(e.shares[me] || 0)}`;
}

function settlementRow(e, me) {
  const to = Object.keys(e.shares)[0];
  return `
    <li><button class="entry settlement" data-action="edit" data-id="${esc(e.id)}">
      <span class="date">${dayFmt.format(parseDate(e.date)).replace(' ', '<br>')}</span>
      <span class="what"><strong>${esc(nameOf(e.paidBy))} paid ${esc(to === me ? 'you' : nameOf(to))}</strong><span class="muted small">Payment</span></span>
      <span class="net"><strong>${formatPence(e.amount)}</strong></span>
    </button></li>`;
}

// ---------- Expense sheet ----------
const entrySheet = $('#entry-sheet');
const entryForm = $('#entry-form');
let editingId = null;

function segRadios(name, options, checked) {
  return options.map(([value, label]) =>
    `<label><input type="radio" name="${name}" value="${esc(value)}" ${value === checked ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('');
}

function openExpense(entry) {
  const me = state.user.uid;
  const partner = partnerOf(state.household, me);
  editingId = entry?.id || null;
  entryForm.reset();
  $('#entry-title').textContent = entry ? 'Edit expense' : 'Add expense';
  $('#delete-entry').hidden = !entry;
  $('#entry-error').textContent = '';
  $('#paid-by').innerHTML = segRadios('paidBy', [[me, 'You'], [partner, nameOf(partner)]], entry?.paidBy || me);

  const f = entryForm.elements;
  f.description.value = entry?.description || '';
  f.amount.value = entry ? (entry.amount / 100).toFixed(2) : '';
  f.date.value = entry?.date || todayISO();
  const split = entry?.split || { type: 'equal' };
  f.splitType.value = split.type;
  if (split.type === 'percent') {
    f.splitValue.value = split.uid === me ? split.percent : 100 - split.percent;
  } else if (split.type === 'exact') {
    f.splitValue.value = ((entry.shares[me] || 0) / 100).toFixed(2);
  }
  updateSplitUi();
  entrySheet.showModal();
  if (!entry) setTimeout(() => f.description.focus(), 50);
}

/** Read the form and compute the entry. Returns { entry } or { error }. */
function readExpenseForm() {
  const f = entryForm.elements;
  const me = state.user.uid;
  const members = state.household.members;
  const description = f.description.value.trim();
  const amount = parsePence(f.amount.value);
  const type = f.splitType.value;

  if (!description) return { error: 'Add a description.' };
  if (!(amount > 0)) return { error: 'Enter an amount, e.g. 12.50' };
  if (!f.date.value) return { error: 'Pick a date.' };

  let split = { type: 'equal' };
  if (type === 'percent') {
    const pct = Number(f.splitValue.value);
    if (f.splitValue.value === '' || !(pct >= 0 && pct <= 100)) return { error: 'Enter your share as a % between 0 and 100.' };
    split = { type: 'percent', percent: pct, uid: me };
  } else if (type === 'exact') {
    const pence = parsePence(f.splitValue.value);
    if (!(pence >= 0) || pence > amount) return { error: `Your share must be between £0 and ${formatPence(amount)}.` };
    split = { type: 'exact', pence, uid: me };
  }

  try {
    const shares = computeShares(amount, f.paidBy.value, members, split);
    // Don't store the redundant pence on exact splits; shares already hold it.
    if (split.type === 'exact') delete split.pence;
    return { entry: { kind: 'expense', description, amount, paidBy: f.paidBy.value, shares, split, date: f.date.value } };
  } catch (err) {
    return { error: err.message };
  }
}

function updateSplitUi() {
  const f = entryForm.elements;
  const type = f.splitType.value;
  const detail = $('#split-detail');
  detail.hidden = type === 'equal';
  $('#split-detail-label').textContent = type === 'percent' ? 'Your share (%)' : 'Your share (£)';
  f.splitValue.placeholder = type === 'percent' ? '50' : '0.00';

  const me = state.user.uid;
  const partner = partnerOf(state.household, me);
  const amount = parsePence(f.amount.value);
  const { entry } = amount > 0 ? readExpenseFormQuiet() : {};
  $('#split-preview').textContent = entry
    ? `You ${formatPence(entry.shares[me])} · ${nameOf(partner)} ${formatPence(entry.shares[partner])}`
    : '';
}

function readExpenseFormQuiet() {
  const f = entryForm.elements;
  // Use placeholders for fields that don't affect the split, so the preview works while typing.
  const saved = [f.description.value, f.date.value];
  if (!f.description.value.trim()) f.description.value = '-';
  if (!f.date.value) f.date.value = todayISO();
  const result = readExpenseForm();
  [f.description.value, f.date.value] = saved;
  return result;
}

entryForm.addEventListener('input', updateSplitUi);
entryForm.addEventListener('change', updateSplitUi);
entryForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const { entry, error } = readExpenseForm();
  if (error) return ($('#entry-error').textContent = error);
  write(backend.saveEntry(state.household.id, { ...entry, ...(editingId && { id: editingId }) }, state.user), editingId ? 'Expense updated' : 'Expense added');
  entrySheet.close();
});
$('#delete-entry').addEventListener('click', () => {
  if (!editingId || !confirm('Delete this expense?')) return;
  write(backend.deleteEntry(state.household.id, editingId), 'Expense deleted');
  entrySheet.close();
});

// ---------- Settle sheet ----------
const settleSheet = $('#settle-sheet');
const settleForm = $('#settle-form');
let editingSettlementId = null;

function openSettle(existing) {
  const me = state.user.uid;
  const partner = partnerOf(state.household, me);
  const summary = summarise(computeBalances(state.entries, state.household.members));
  editingSettlementId = existing?.id || null;
  settleForm.reset();
  $('#settle-error').textContent = '';
  $('#delete-settlement').hidden = !existing;
  $('#settle-title').textContent = existing ? 'Edit payment' : 'Settle up';

  const payer = existing?.paidBy || summary?.from || me;
  $('#settle-direction').innerHTML = segRadios('from', [[me, `You paid ${nameOf(partner)}`], [partner, `${nameOf(partner)} paid you`]], payer);
  const f = settleForm.elements;
  f.amount.value = existing ? (existing.amount / 100).toFixed(2) : summary ? (summary.amount / 100).toFixed(2) : '';
  f.date.value = existing?.date || todayISO();
  settleSheet.showModal();
}

settleForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = settleForm.elements;
  const amount = parsePence(f.amount.value);
  if (!(amount > 0)) return ($('#settle-error').textContent = 'Enter an amount, e.g. 20.00');
  if (!f.date.value) return ($('#settle-error').textContent = 'Pick a date.');
  const from = f.from.value;
  const to = partnerOf(state.household, from);
  const entry = { kind: 'settlement', description: 'Payment', amount, ...settlementShares(from, to, amount), date: f.date.value };
  write(backend.saveEntry(state.household.id, { ...entry, ...(editingSettlementId && { id: editingSettlementId }) }, state.user), 'Payment recorded');
  settleSheet.close();
});
$('#delete-settlement').addEventListener('click', () => {
  if (!editingSettlementId || !confirm('Delete this payment?')) return;
  write(backend.deleteEntry(state.household.id, editingSettlementId), 'Payment deleted');
  settleSheet.close();
});

// ---------- Menu ----------
function openMenu() {
  const hh = state.household;
  const partner = partnerOf(hh, state.user.uid);
  $('#menu-body').innerHTML = `
    <div class="stack">
      <p>Signed in as <strong>${esc(state.user.name)}</strong><br><span class="muted small">${esc(state.user.email)}</span></p>
      <p>Sharing with <strong>${partner ? esc(nameOf(partner)) : 'nobody yet'}</strong></p>
      ${partner ? '' : `<button class="btn wide" data-action="share-invite">Share invite link</button>`}
      <button class="btn secondary wide" data-action="export-csv">Export as CSV</button>
      <button class="btn danger wide" data-action="sign-out">Sign out</button>
      ${DEMO ? '<p class="muted small">Demo mode — nothing is saved.</p>' : ''}
    </div>`;
  $('#menu-sheet').showModal();
}

function exportCsv() {
  const me = state.user.uid;
  const partner = partnerOf(state.household, me);
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Date', 'Type', 'Description', 'Amount', 'Paid by', `${nameOf(me)} share`, `${nameOf(partner)} share`]];
  for (const e of [...state.entries].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([e.date, e.kind, e.description, (e.amount / 100).toFixed(2), state.household.names[e.paidBy] || '',
      ((e.shares[me] || 0) / 100).toFixed(2), ((e.shares[partner] || 0) / 100).toFixed(2)]);
  }
  const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `halves-${todayISO()}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function shareInvite() {
  const url = inviteLink();
  const text = `Join me on Halves so we can split bills: ${url}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Halves', text, url });
    else { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
  } catch (err) {
    if (err.name !== 'AbortError') toast('Couldn’t share. Copy the code instead.');
  }
}

// ---------- Events ----------
document.addEventListener('click', async (ev) => {
  const closeBtn = ev.target.closest('[data-close]');
  if (closeBtn) return closeBtn.closest('dialog').close();
  // Tap on the dimmed backdrop closes a sheet.
  if (ev.target.tagName === 'DIALOG') return ev.target.close();

  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case 'toggle-auth': state.authMode = state.authMode === 'signin' ? 'signup' : 'signin'; return render();
    case 'reset-password': {
      const email = $('#auth-form')?.elements.email.value.trim();
      if (!email) return ($('#auth-error').textContent = 'Enter your email above first.');
      try { await backend.resetPassword(email); toast('Password reset email sent'); } catch (err) { $('#auth-error').textContent = friendlyError(err); }
      return;
    }
    case 'create-household': {
      state.busy = true; render();
      try { await backend.createHousehold(state.user); } catch (err) { toast(friendlyError(err)); }
      state.busy = false; return render();
    }
    case 'sign-out': $('#menu-sheet').close(); return backend.signOut();
    case 'open-menu': return openMenu();
    case 'share-invite': return shareInvite();
    case 'export-csv': return exportCsv();
    case 'add-expense': return openExpense();
    case 'settle': return openSettle();
    case 'edit': {
      const entry = state.entries.find((e) => e.id === el.dataset.id);
      if (!entry) return;
      return entry.kind === 'settlement' ? openSettle(entry) : openExpense(entry);
    }
    case 'hide-hint': localStorage.setItem('hideInstallHint', '1'); return render();
    case 'install': deferredInstall?.prompt(); deferredInstall = null; return render();
  }
});

document.addEventListener('submit', async (ev) => {
  if (ev.target.id === 'auth-form') {
    ev.preventDefault();
    const f = ev.target.elements;
    const err = $('#auth-error');
    const email = f.email.value.trim();
    const password = f.password.value;
    if (state.authMode === 'signup' && !f.name.value.trim()) return (err.textContent = 'Tell us your first name.');
    if (!email || !password) return (err.textContent = 'Enter your email and password.');
    state.busy = true;
    ev.target.querySelector('[type=submit]').disabled = true;
    try {
      if (state.authMode === 'signup') await backend.signUp(f.name.value.trim(), email, password);
      else await backend.signIn(email, password);
    } catch (e) {
      err.textContent = friendlyError(e);
      ev.target.querySelector('[type=submit]').disabled = false;
    } finally {
      state.busy = false;
    }
  }

  if (ev.target.id === 'join-form') {
    ev.preventDefault();
    const code = ev.target.elements.code.value.trim();
    if (!code) return ($('#join-error').textContent = 'Paste the invite code or open the invite link.');
    state.busy = true;
    ev.target.querySelector('[type=submit]').disabled = true;
    try {
      await backend.joinHousehold(code, state.user);
      sessionStorage.removeItem('pendingJoin');
    } catch (e) {
      $('#join-error').textContent = e.code === 'permission-denied' ? 'That invite code isn’t valid.' : friendlyError(e);
      ev.target.querySelector('[type=submit]').disabled = false;
    } finally {
      state.busy = false;
    }
  }
});

// ---------- PWA install ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  deferredInstall = ev;
  if (state.household) render();
});

if ('serviceWorker' in navigator && !DEMO) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ---------- Boot ----------
async function boot() {
  if (!DEMO && !isConfigured) return render();
  backend = DEMO ? await import('./demo-backend.js') : await import('./firebase-backend.js');

  backend.watchAuth((user) => {
    unsubHousehold(); unsubEntries();
    state.user = user;
    state.household = undefined;
    state.entries = [];
    render();
    if (!user) return;

    let currentHid = null;
    unsubHousehold = backend.watchHousehold(user.uid, (hh) => {
      state.household = hh;
      if (hh?.id !== currentHid) {
        unsubEntries();
        currentHid = hh?.id || null;
        if (hh) unsubEntries = backend.watchEntries(hh.id, (entries) => { state.entries = entries; render(); }, (e) => toast(friendlyError(e)));
      }
      render();
    }, (e) => toast(friendlyError(e)));
  });
}

boot().catch((err) => {
  console.error(err);
  $('#app').innerHTML = `<section class="card onboarding"><h1>Couldn’t start</h1><p>${esc(err.message)}</p><p class="muted small">Check your connection and reload.</p></section>`;
});
