/**
 * Shared status-tab → Prisma where fragment for vendor + admin order lists.
 * Mirrors the brief filter aliases used on /vendor/orders.
 */
export function buildOrderStatusWhere(statusParam?: string | null): Record<string, unknown> {
  let statusWhere: Record<string, unknown> = { status: { not: 'draft' } };
  if (!statusParam || statusParam === 'all' || statusParam === 'draft') {
    return statusWhere;
  }

  switch (statusParam) {
    case 'new':
      statusWhere = { status: 'confirmed' };
      break;
    case 'processing':
      statusWhere = {
        status: { in: ['processing', 'ready_for_dispatch', 'shipped', 'partially_delivered'] },
      };
      break;
    case 'accepted':
      statusWhere = { status: 'confirmed' };
      break;
    case 'partially_accepted':
      statusWhere = { isPartial: true, status: { not: 'draft' } };
      break;
    case 'packed':
      statusWhere = { status: 'processing' };
      break;
    case 'dispatched':
      statusWhere = { status: 'shipped' };
      break;
    case 'completed':
      statusWhere = { status: 'delivered' };
      break;
    case 'abandoned':
      statusWhere = {
        status: 'pending',
        abandonedAt: { not: null },
        paymentStatus: { not: 'paid' },
      };
      break;
    case 'pending':
      statusWhere = { status: 'pending', abandonedAt: null };
      break;
    default:
      statusWhere = { status: statusParam };
      break;
  }

  return statusWhere;
}

export function buildCreatedAtFilter(
  dateFrom?: string | null,
  dateTo?: string | null,
): { gte?: Date; lte?: Date } | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (dateFrom) createdAtFilter.gte = new Date(dateFrom);
  if (dateTo) createdAtFilter.lte = new Date(`${dateTo}T23:59:59Z`);
  return createdAtFilter;
}

export function buildPaymentMethodWhere(
  paymentMethod?: string | null,
): Record<string, unknown> | undefined {
  if (!paymentMethod) return undefined;
  if (paymentMethod === 'credit') {
    return { paymentMethod: { in: ['credit', 'vendor_credit', 'discco'] } };
  }
  if (paymentMethod === 'cash' || paymentMethod === 'cod') {
    return { paymentMethod: { in: ['cod', 'cash'] } };
  }
  return { paymentMethod };
}
