// Lightweight image metadata encoded in the URL fragment.
//
// Why a URL fragment? It's appended to the URL string we already store, so no
// schema change is needed. Browsers strip the fragment when fetching the image
// (so it never reaches ImageKit), but our display code can read it from the
// React prop and apply object-position + scale.
//
// Format: `<url>#fp=<x>,<y>&z=<zoom>`
//   fp.x, fp.y: 0-100 (% of image, defaults to 50,50 = center)
//   z: 1.0-3.0 (zoom multiplier, defaults to 1)
//
// Display code uses parseImageMeta(url) to get { src, objectPosition, transform }.
// Editor code uses buildImageMetaUrl(url, meta) to write the fragment back.

export interface ImageMeta {
    /** Focal point X as 0-100 percent. */
    x: number;
    /** Focal point Y as 0-100 percent. */
    y: number;
    /** Zoom multiplier (1 = no zoom, 2 = 2x). */
    zoom: number;
}

const DEFAULT_META: ImageMeta = { x: 50, y: 50, zoom: 1 };

/** Strip the fragment from a URL and parse out our meta if present. */
export function parseImageMeta(url: string | null | undefined): { src: string; meta: ImageMeta } {
    if (!url) return { src: '', meta: DEFAULT_META };
    const hashIdx = url.indexOf('#');
    if (hashIdx === -1) return { src: url, meta: DEFAULT_META };

    const src = url.slice(0, hashIdx);
    const fragment = url.slice(hashIdx + 1);
    const params = new URLSearchParams(fragment);

    const meta: ImageMeta = { ...DEFAULT_META };
    const fp = params.get('fp');
    if (fp) {
        const [x, y] = fp.split(',').map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            meta.x = Math.max(0, Math.min(100, x));
            meta.y = Math.max(0, Math.min(100, y));
        }
    }
    const z = params.get('z');
    if (z) {
        const zoom = Number(z);
        if (Number.isFinite(zoom)) meta.zoom = Math.max(1, Math.min(3, zoom));
    }
    return { src, meta };
}

/** Append (or replace) our meta fragment on a URL. */
export function buildImageMetaUrl(url: string, meta: Partial<ImageMeta>): string {
    if (!url) return url;
    const { src } = parseImageMeta(url); // strip any existing fragment first
    const merged: ImageMeta = { ...DEFAULT_META, ...meta };
    // Skip the fragment entirely if it's the default (centered, no zoom)
    if (merged.x === 50 && merged.y === 50 && merged.zoom === 1) return src;
    const params = new URLSearchParams();
    params.set('fp', `${Math.round(merged.x)},${Math.round(merged.y)}`);
    if (merged.zoom !== 1) params.set('z', merged.zoom.toFixed(2));
    return `${src}#${params.toString()}`;
}

/**
 * Supplier logos are square canvases with the artwork in a short band.
 * Scaling that canvas with CSS clips the name and still leaves the mark small.
 * Strip the #fp fragment (it must not be sent to the image loader) and ask
 * ImageKit to trim the empty border so the artwork can be sized by its real shape.
 */
export function supplierLogoSrc(url: string | null | undefined): string {
    const { src } = parseImageMeta(url);
    if (!src) return '';
    try {
        const parsed = new URL(src);
        if (parsed.hostname !== 'ik.imagekit.io') return src;
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return src;
        if (parts[1].startsWith('tr:')) {
            const flags = parts[1].split(',');
            if (!flags.includes('t-true')) parts[1] = `${parts[1]},t-true`;
        } else {
            parts.splice(1, 0, 'tr:t-true');
        }
        parsed.pathname = `/${parts.join('/')}`;
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return src;
    }
}

/** Helper for display: ready-to-use object-position + transform-origin strings. */
export function getDisplayStyle(meta: ImageMeta): { objectPosition: string; transform?: string; transformOrigin?: string } {
    const objectPosition = `${meta.x}% ${meta.y}%`;
    if (meta.zoom === 1) return { objectPosition };
    return {
        objectPosition,
        transform: `scale(${meta.zoom})`,
        transformOrigin: `${meta.x}% ${meta.y}%`,
    };
}
