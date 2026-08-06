// Shared semantic labels for brand mapping confidence + status.
// Raw "85%" means nothing to a vendor — these wrap a score/status into
// words and a tone token the UI can color-code consistently.

export type ConfidenceTone = 'high' | 'medium' | 'low';

export function confidenceLabel(score: number): { label: string; tone: ConfidenceTone; percent: number } {
  const percent = Math.round(score * 100);
  if (score >= 0.90) return { label: 'Very likely match', tone: 'high', percent };
  if (score >= 0.80) return { label: 'Likely match', tone: 'high', percent };
  if (score >= 0.70) return { label: 'Possible match', tone: 'medium', percent };
  return { label: 'Uncertain', tone: 'low', percent };
}

export type MappingStatusTone = 'live' | 'pending' | 'rejected';

export type MappingLabelAudience = 'brand' | 'vendor' | 'default';

export function mappingStatusLabel(
  status: string,
  audience: MappingLabelAudience = 'default',
): { label: string; tone: MappingStatusTone } {
  switch (status) {
    case 'auto_mapped':    return { label: 'Live · Auto', tone: 'live' };
    case 'verified':       return { label: 'Live · Confirmed', tone: 'live' };
    case 'pending_review':
      return audience === 'brand'
        ? { label: 'Awaiting distributor confirmation', tone: 'pending' }
        : { label: 'Awaiting your review', tone: 'pending' };
    case 'rejected':       return { label: 'Unlinked', tone: 'rejected' };
    default:               return { label: status, tone: 'pending' };
  }
}

export function distributorAuthLabel(status: string | null | undefined): { label: string; tone: MappingStatusTone } {
  switch (status) {
    case 'approved': return { label: 'Approved', tone: 'live' };
    case 'rejected': return { label: 'Unlinked', tone: 'rejected' };
    case 'pending': return { label: 'Pending approval', tone: 'pending' };
    default: return { label: 'Not authorized', tone: 'pending' };
  }
}

// Tailwind colour tokens for each tone — keeps the look consistent across pages.
export const TONE_STYLES: Record<ConfidenceTone | MappingStatusTone, { text: string; bg: string; border: string }> = {
  high:     { text: 'text-[#53B175]', bg: 'bg-[#EEF8F1]', border: 'border-[#53B175]/30' },
  medium:   { text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  low:      { text: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200' },
  live:     { text: 'text-[#53B175]', bg: 'bg-[#EEF8F1]', border: 'border-[#53B175]/30' },
  pending:  { text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  rejected: { text: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200' },
};
