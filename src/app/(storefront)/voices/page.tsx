import Link from 'next/link';
import Image from 'next/image';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { listPublishedVoiceStories } from '@/modules/voices/voice.service';

export default async function VoicesIndexPage() {
  const stories = await listPublishedVoiceStories(20);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-8">
        <SectionHeader title="Horeca1 Voices" subtitle="Stories from restaurateurs and chefs across India" />
        {stories.length === 0 ? (
          <p className="text-text-secondary text-[15px] text-pretty">
            Featured stories appear on the homepage. More voices coming soon.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
            {stories.map((story) => (
              <li key={story.id}>
                <Link
                  href={`/voices/${story.slug}`}
                  className="block bg-white border border-divider rounded-xl overflow-hidden shadow-cdl-1 hover:border-primary/30 transition-colors"
                >
                  {story.photoUrl && (
                    <div className="relative aspect-[16/10] bg-ivory">
                      <Image src={story.photoUrl} alt="" fill className="object-cover" unoptimized />
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    {story.badge && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-primary">{story.badge}</span>
                    )}
                    <p className="text-[15px] font-semibold text-text line-clamp-2">&ldquo;{story.quote}&rdquo;</p>
                    <p className="text-[13px] text-text-secondary">
                      {story.name}
                      {story.role ? ` · ${story.role}` : ''}
                      {story.venue ? ` · ${story.venue}` : ''}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/" className="inline-block mt-8 text-primary font-semibold hover:underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
