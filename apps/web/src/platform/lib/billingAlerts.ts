// How far ahead to warn about a renewal before it's actually overdue. Shared between
// NotificationsPage (which lists the rows) and PlatformLayout (which badges the count) so the
// two can never silently drift out of sync.
export const UPCOMING_WINDOW_DAYS = 7;

export function daysUntil(dueDate: string): number {
  return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
}

interface BillingAlertRow {
  isOverdue: boolean;
  status: string;
  nextDueDate: string | null;
}

export function isUpcomingRenewal(row: BillingAlertRow): boolean {
  return !row.isOverdue && row.status !== "CANCELLED" && !!row.nextDueDate && daysUntil(row.nextDueDate) <= UPCOMING_WINDOW_DAYS;
}

export function countActionableAlerts<T extends BillingAlertRow>(rows: T[]): number {
  return rows.filter((r) => r.isOverdue || isUpcomingRenewal(r)).length;
}
