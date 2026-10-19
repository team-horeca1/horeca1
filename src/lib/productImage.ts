/** A listing can go live only when it has at least one photo. */
export function hasProductImage(imageUrl: unknown, images: unknown): boolean {
  if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) return true;
  if (!Array.isArray(images)) return false;
  return images.some((img) => {
    if (typeof img === 'string') return img.trim().length > 0;
    if (img && typeof img === 'object' && 'url' in img) {
      const url = (img as { url?: unknown }).url;
      return typeof url === 'string' && url.trim().length > 0;
    }
    return false;
  });
}
