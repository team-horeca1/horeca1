/** Due-date labels for DiSCCO credit lines — uses the line's configured due date. */

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dueLabel(dueDate: string | null, outstanding: number): {
  text: string;
  tone: 'ok' | 'soon' | 'overdue' | 'none';
} {
  if (outstanding <= 0 || !dueDate) return { text: 'No payment due', tone: 'none' };
  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(new Date());
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const dateStr = due.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (diffDays < 0) {
    return {
      text: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} · ${dateStr}`,
      tone: 'overdue',
    };
  }
  if (diffDays === 0) return { text: `Due today · ${dateStr}`, tone: 'soon' };
  if (diffDays <= 7) {
    return {
      text: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'} · ${dateStr}`,
      tone: 'soon',
    };
  }
  return { text: `Due ${dateStr}`, tone: 'ok' };
}
