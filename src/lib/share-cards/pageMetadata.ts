import 'server-only';
import type { Metadata } from 'next';
import { shareSiteOrigin } from '@/lib/share-cards/ogHelpers';

export function catalogShareMetadata(opts: {
  title: string;
  description: string;
  path: string;
  ogPath: string;
}): Metadata {
  const origin = shareSiteOrigin();
  const url = `${origin}${opts.path.startsWith('/') ? opts.path : `/${opts.path}`}`;
  const image = opts.ogPath.startsWith('http')
    ? opts.ogPath
    : `${origin}${opts.ogPath.startsWith('/') ? opts.ogPath : `/${opts.ogPath}`}`;

  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      type: 'website',
      images: [
        {
          url: image,
          width: 1080,
          height: 1080,
          alt: opts.title,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      images: [image],
    },
  };
}
