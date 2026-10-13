// utils/pointsSystem.js
// Category points reward the item type; action points reward the workflow
// step. Total = category + action, stacked.
//
// Only ONE action constant exists for the report/surrender step —
// SURRENDER_ITEM — since a walk-in surrender IS the report for this flow.
// (REPORT_ITEM was removed: it duplicated SURRENDER_ITEM's value and was
// never actually referenced anywhere in FoundItems.jsx.)

export const CATEGORY_POINTS = {
  'Electronic': 5,          // Electronics
  'ID': 4,                  // Identification documents
  'Bags & Wallets': 4,      // Wallets and bags
  'Keys': 3,                // Keys and access items
  'Academic Materials': 2,  // Academic materials
  'Accessories': 3,         // Accessories
  'Clothing': 2,            // Clothing
};

export const ACTION_POINTS = {
  SURRENDER_ITEM: 4,  // Report / surrender found item
  ITEM_CLAIMED: 8,    // Found item successfully claimed by its rightful owner
};

export const REASON_LABELS = {
  SURRENDER_ITEM: 'Surrendered item',
  ITEM_CLAIMED: 'Item claimed by owner',
};

// Unknown category/action falls back to 0 instead of throwing, so a typo'd
// or newly-added category never breaks the flow — it just scores 0 for that part.
export function calculatePoints(category, actionType) {
  const categoryPts = CATEGORY_POINTS[category] ?? 0;
  const actionPts = ACTION_POINTS[actionType] ?? 0;
  return categoryPts + actionPts;
}

export function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}