# Halves: product spec

## Purpose
Two people in a relationship share costs: shopping, bills, meals out, trips. Halves keeps one running tab between them so neither has to remember who paid for what, and settling up is a single number.

## v1 (built)
| Area | Behaviour |
|---|---|
| Accounts | Email/password sign-up and sign-in, plus password reset by email |
| Pairing | One person creates a shared tab and sends an invite link (`?join=<code>`). The second person signs up and joins. Exactly two members. |
| Add expense | Description, amount (£), date, who paid, and a split: 50/50, by % (your share), or exact £ (your share). Shows a live preview of each person's share. |
| Rounding | For a 50/50 split of an odd amount, the payer absorbs the extra penny. Percentage splits round to the nearest penny, and the other person gets the remainder. |
| Balance | A headline card: "Sam owes you £x", "You owe Sam £x" or "All settled up" |
| Settle up | Records a payment made outside the app. The amount and direction are pre-filled from the balance and can be edited. |
| History | Grouped by month, newest first. Each row shows what you lent or borrowed on that entry. Tap a row to edit or delete it. |
| Export | CSV of every entry |
| PWA | Installable, offline app shell. Firestore's offline cache means expenses can be added offline and sync later. Light and dark mode. |

## Roadmap: suggested Claude Code prompts
Work through these one at a time in Claude Code from the repo root. Each one is a self-contained change.

1. **Categories**: "Add an optional category to expenses (Groceries, Bills, Eating out, Transport, Home, Travel, Other) with an emoji each. Show it in the history row, let me filter the history by category, and add it to the CSV export. Update the Firestore rules and the demo data."
2. **Monthly summary**: "Add a Summary view showing total spending per month and per category for the two of us, and how much each of us paid. Keep the maths in a pure, tested function in money.js."
3. **Recurring bills**: "Add recurring expenses (monthly on a given day) for rent, utilities and subscriptions. Store templates in `households/{id}/recurring` and create any due entries when the app opens, idempotently, so both phones opening at once never creates duplicates (use a deterministic document ID per template + month). Add rules and tests."
4. **Receipt photos**: "Let me attach a receipt photo to an expense using Firebase Storage. Compress it client-side to max 1600px JPEG first. Only household members can read or write it. Add Storage rules."
5. **Search**: "Add a search box above the history that filters by description and amount."
6. **Notifications**: "Notify my partner when I add an expense over £20, using Firebase Cloud Messaging web push. (Note: on iPhone this only works when the app is installed to the home screen.)"
7. **Monzo/bank payment link**: "On Settle up, add a 'Pay with Monzo' button that opens a monzo.me link for the amount. Store each person's monzo.me username in the household `names` map."
8. **Name changes**: "Let each person change their display name from Settings, updating both their Auth profile and `households/{id}.names`."

## Non-goals (for now)
- More than two people per tab, or multiple tabs per person
- Multiple currencies
- Bank account syncing
