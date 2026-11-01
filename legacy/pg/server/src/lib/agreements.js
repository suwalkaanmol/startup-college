// Roommate checklist items (single source of truth; ids are stored, labels are shown).
export const AGREEMENT_ITEMS = [
  { id: 'cleaning', label: 'We will share the cleaning of common spaces' },
  { id: 'bills', label: 'We will split bills (electricity, water, Wi-Fi) fairly' },
  { id: 'quiet', label: 'We agree on quiet hours for sleep and calls' },
  { id: 'friends', label: 'Friends can visit, with a heads-up to each other first' },
  { id: 'food', label: 'We will talk about shared groceries before buying them' },
  { id: 'issues', label: 'We will raise problems early and politely' },
];
export const AGREEMENT_IDS = AGREEMENT_ITEMS.map((i) => i.id);
