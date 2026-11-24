// Pure money logic. No DOM, no Firebase — keep it that way so it stays unit-testable.
// All amounts are integer pence. Never store or sum floats.

/** Parse a user-typed amount like "12.5", "£1,234.56" or "7" into integer pence. Returns NaN if invalid. */
export function parsePence(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : NaN;
  const cleaned = String(input).replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return NaN;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

/** Format integer pence as "£12.34". */
export function formatPence(pence) {
  return gbp.format(pence / 100);
}

/**
 * Work out each member's share of an expense.
 * @param {number} amount   total in pence
 * @param {string} paidBy   uid of the payer
 * @param {string[]} members exactly two uids
 * @param {{type:'equal'}|{type:'percent', percent:number, uid:string}|{type:'exact', pence:number, uid:string}} split
 *   For percent/exact, `uid` is the member whose share is given; the other member gets the rest.
 * @returns {Record<string, number>} shares in pence, always summing to `amount`
 */
export function computeShares(amount, paidBy, members, split) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive whole number of pence');
  if (members.length !== 2) throw new Error('Exactly two members are required');
  if (!members.includes(paidBy)) throw new Error('Payer must be a member');
  const [a, b] = members;

  if (split.type === 'equal') {
    const half = Math.floor(amount / 2);
    const odd = amount - half * 2; // 0 or 1 penny
    // The payer absorbs any odd penny, so nobody is asked to pay back more than half.
    return { [a]: half + (paidBy === a ? odd : 0), [b]: half + (paidBy === b ? odd : 0) };
  }

  const other = split.uid === a ? b : a;
  if (!members.includes(split.uid)) throw new Error('Split member must be a member');

  if (split.type === 'percent') {
    const pct = Number(split.percent);
    if (!(pct >= 0 && pct <= 100)) throw new Error('Percent must be between 0 and 100');
    const mine = Math.round((amount * pct) / 100);
    return { [split.uid]: mine, [other]: amount - mine };
  }

  if (split.type === 'exact') {
    const mine = split.pence;
    if (!Number.isInteger(mine) || mine < 0 || mine > amount) throw new Error('Exact share must be between £0 and the total');
    return { [split.uid]: mine, [other]: amount - mine };
  }

  throw new Error(`Unknown split type: ${split.type}`);
}

/**
 * Net balance per member across all entries.
 * Positive = the member is owed money; negative = they owe. Balances always sum to zero.
 * Entries are expenses or settlements; both use { amount, paidBy, shares }.
 * A settlement where A pays B £x is stored as { paidBy: A, shares: { [B]: x } }.
 */
export function computeBalances(entries, members) {
  const bal = Object.fromEntries(members.map((m) => [m, 0]));
  for (const e of entries) {
    if (e.deleted) continue;
    if (e.paidBy in bal) bal[e.paidBy] += e.amount;
    for (const [uid, share] of Object.entries(e.shares || {})) {
      if (uid in bal) bal[uid] -= share;
    }
  }
  return bal;
}

/** For two people: who owes whom, and how much. Returns null when settled. */
export function summarise(balances) {
  const entries = Object.entries(balances);
  const creditor = entries.find(([, v]) => v > 0);
  const debtor = entries.find(([, v]) => v < 0);
  if (!creditor || !debtor) return null;
  return { from: debtor[0], to: creditor[0], amount: creditor[1] };
}

/** Build a settlement entry: `from` pays `to`. */
export function settlementShares(from, to, amount) {
  return { paidBy: from, shares: { [to]: amount } };
}
