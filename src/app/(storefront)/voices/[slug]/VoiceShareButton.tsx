'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

export function VoiceShareButton({ slug, name }: { slug: string; name: string }) {
  const share = async () => {
    const url = `${window.location.origin}/voices/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary bg-primary-light px-3 py-1.5 rounded-lg"
    >
      <Share2 size={16} />
      Share
    </button>
  );
}
