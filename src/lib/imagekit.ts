import ImageKit from '@imagekit/nodejs';

const globalForImageKit = globalThis as unknown as { imagekit: ImageKit };

// ImageKit URL endpoint — used for generating image URLs on the client
export const IMAGEKIT_URL_ENDPOINT =
  process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/nasjugiz2';

// Folder structure for organized uploads
export const IMAGEKIT_FOLDERS = {
  products: '/horeca/products',
  categories: '/horeca/categories',
  vendors: '/horeca/vendors',
  brands: '/horeca/brands',
  banners: '/horeca/banners',
  collections: '/horeca/collections',
  misc: '/horeca/misc',
} as const;

export type ImageFolder = keyof typeof IMAGEKIT_FOLDERS;

// Lazy getter — only creates client when image upload code actually runs
// @imagekit/nodejs v7+ ClientOptions only accepts privateKey
export function getImageKit(): ImageKit {
  if (!globalForImageKit.imagekit) {
    if (!process.env.IMAGEKIT_PRIVATE_KEY) {
      throw new Error('IMAGEKIT_PRIVATE_KEY must be set in environment');
    }
    globalForImageKit.imagekit = new ImageKit({
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    });
  }
  return globalForImageKit.imagekit;
}
