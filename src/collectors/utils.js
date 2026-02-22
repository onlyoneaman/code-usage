export function normalizeCutoffDate(value) {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeCurrentStreakFromDates(activeDatesInput) {
  const activeDates = activeDatesInput instanceof Set ? activeDatesInput : new Set(activeDatesInput);
  let streak = 0;
  const check = new Date();
  while (activeDates.has(localDateStr(check))) {
    streak++;
    check.setDate(check.getDate() - 1);
  }
  return streak;
}
