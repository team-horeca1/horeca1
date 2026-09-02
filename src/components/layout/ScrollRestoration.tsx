'use client';
import { CDL } from '@/lib/cdl';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Manual scroll restoration — browser-native + Next experimental both fire
// before async sections render, so we own this end-to-end.
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
}

const DEBUG = false; // flip to true to surface the on-page trace overlay
const MAX_LINES = 12;

// Shared trace store. Snapshot identity changes on every push so
// useSyncExternalStore re-renders subscribers. Listeners are notified
// synchronously inside pushTrace, so any subscriber registered at any
// point catches subsequent pushes.
type TraceEntry = { t: number; line: string };
const EMPTY: ReadonlyArray<TraceEntry> = Object.freeze([]);
let traceSnapshot: ReadonlyArray<TraceEntry> = EMPTY;
const traceListeners = new Set<() => void>();

function pushTrace(line: string) {
    if (!DEBUG) return;
    const next = [...traceSnapshot, { t: Date.now(), line }];
    if (next.length > MAX_LINES) next.shift();
    traceSnapshot = Object.freeze(next);
    traceListeners.forEach(l => l());
    // eslint-disable-next-line no-console
    console.error('[scroll]', line);
}

function subscribeTrace(cb: () => void) {
    traceListeners.add(cb);
    return () => { traceListeners.delete(cb); };
}
function getTraceSnapshot() { return traceSnapshot; }
function getServerSnapshot(): ReadonlyArray<TraceEntry> { return EMPTY; }

// Navigation direction detection via a monotonic counter stored INSIDE
// history.state. The browser saves the state object with each history
// entry; on back/forward the prior state (with its lower counter) is
// restored. So comparing current vs last-seen counter uniquely identifies
// a traversal back — independent of when popstate fires (it fires AFTER
// our NAV effect in Next.js App Router, making event-based detection
// unreliable). Counter is preserved across reloads by living in history.state.
const SC_KEY = '__h1ScrollCounter';
let nextCounter = 1;
let lastSeenCounter = 0;

function readCounter(): number {
    const s = window.history.state as Record<string, unknown> | null;
    const v = s && typeof s === 'object' ? s[SC_KEY] : undefined;
    return typeof v === 'number' ? v : 0;
}

if (typeof window !== 'undefined') {
    pushTrace(`MODULE_LOADED at ${new Date().toISOString().slice(11, 23)}`);

    // Seed the current entry with counter=0 if not already tagged.
    const existing = readCounter();
    if (existing > 0) {
        lastSeenCounter = existing;
        nextCounter = existing + 1;
        pushTrace(`seed: reusing existing counter=${existing}`);
    } else {
        const cur = window.history.state;
        const seeded = cur && typeof cur === 'object'
            ? { ...(cur as object), [SC_KEY]: 0 }
            : { [SC_KEY]: 0 };
        try {
            window.history.replaceState(seeded, '');
            pushTrace('seed: tagged current entry counter=0');
        } catch (e) {
            pushTrace(`seed: replaceState failed: ${String(e)}`);
        }
    }

    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);

    window.history.pushState = function (
        state: unknown,
        title: string,
        url?: string | URL | null,
    ) {
        const counter = nextCounter++;
        const wrappedState = state && typeof state === 'object'
            ? { ...(state as object), [SC_KEY]: counter }
            : { [SC_KEY]: counter };
        pushTrace(`pushState intercepted counter=${counter}`);
        return origPush(wrappedState, title, url ?? null);
    };

    window.history.replaceState = function (
        state: unknown,
        title: string,
        url?: string | URL | null,
    ) {
        // replaceState keeps the same entry — preserve the current counter
        // so we don't accidentally bump it.
        const current = readCounter();
        const wrappedState = state && typeof state === 'object'
            ? { ...(state as object), [SC_KEY]: current }
            : { [SC_KEY]: current };
        return origReplace(wrappedState, title, url ?? null);
    };
}

export function ScrollRestoration() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isFirstNav = useRef(true);

    const buildKey = (path: string, query: string) => `scroll:${path}${query ? '?' + query : ''}`;

    useEffect(() => {
        pushTrace(`MOUNT history.scrollRestoration=${window.history.scrollRestoration}`);
    }, []);

    // Save outgoing scroll. KEY captured in closure so unmount writes under
    // OUTGOING page's URL.
    useEffect(() => {
        const key = buildKey(pathname, searchParams?.toString() ?? '');

        let scheduled = false;
        const saveThrottled = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                sessionStorage.setItem(key, String(window.scrollY));
                scheduled = false;
            });
        };
        const saveNow = (label: string) => {
            const y = window.scrollY;
            sessionStorage.setItem(key, String(y));
            pushTrace(`SAVE ${label} key=${key} y=${y}`);
        };

        window.addEventListener('scroll', saveThrottled, { passive: true });
        const onBeforeUnload = () => saveNow('beforeunload');
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            saveNow('unmount(leaving page)');
            window.removeEventListener('scroll', saveThrottled);
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [pathname, searchParams]);

    // Apply the right scroll on every navigation.
    useEffect(() => {
        const key = buildKey(pathname, searchParams?.toString() ?? '');
        const currentCounter = readCounter();
        const first = isFirstNav.current;
        // Counter went DOWN → user traversed back (browser restored prior
        // state with smaller counter). Counter UP or same on first nav → forward.
        const wasPop = !first && currentCounter < lastSeenCounter;
        const wasForward = !first && currentCounter > lastSeenCounter;
        pushTrace(`NAV path=${pathname} counter=${currentCounter} last=${lastSeenCounter} first=${first} pop=${wasPop} fwd=${wasForward} hash=${window.location.hash || '∅'}`);
        lastSeenCounter = currentCounter;
        isFirstNav.current = false;

        if (window.location.hash) return;

        if (wasPop) {
            const saved = sessionStorage.getItem(key);
            pushTrace(`RESTORE key=${key} savedY=${saved}`);
            if (saved === null) {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                return;
            }
            const targetY = parseInt(saved, 10);
            if (!Number.isFinite(targetY) || targetY < 0) return;

            const startedAt = performance.now();
            const tick = () => {
                const maxReachable = document.documentElement.scrollHeight - window.innerHeight;
                const land = Math.min(targetY, Math.max(0, maxReachable));
                window.scrollTo({ top: land, left: 0, behavior: 'instant' });
                if (maxReachable >= targetY) {
                    pushTrace(`RESTORED y=${window.scrollY} target=${targetY} after=${Math.round(performance.now() - startedAt)}ms`);
                    return;
                }
                if (performance.now() - startedAt > 1500) {
                    pushTrace(`RESTORE TIMEOUT y=${window.scrollY} target=${targetY} maxReachable=${maxReachable}`);
                    return;
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        } else {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            pushTrace(`FORWARD scrolled to top`);
        }
    }, [pathname, searchParams]);

    return <ScrollDebugOverlay />;
}

/** Floating overlay (bottom-right) showing the last few scroll trace events.
 *  Can't be hidden by console filters. Click the [×] to dismiss for this session. */
function ScrollDebugOverlay() {
    const entries = useSyncExternalStore(subscribeTrace, getTraceSnapshot, getServerSnapshot);
    const [hidden, setHidden] = useState(false);

    if (!DEBUG || hidden) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 8,
                right: 8,
                zIndex: 99999,
                width: 380,
                maxHeight: 280,
                overflow: 'auto',
                background: 'rgba(20,20,30,0.95)',
                color: '#9fffbb',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 10,
                lineHeight: 1.4,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${CDL.primary}`,
                pointerEvents: 'auto',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: CDL.primary, fontWeight: 700 }}>
                <span>[scroll] debug · {entries.length}</span>
                <button onClick={() => setHidden(true)} style={{ background: 'transparent', border: 0, color: CDL.primary, cursor: 'pointer' }}>×</button>
            </div>
            {entries.length === 0 && <div style={{ color: '#777' }}>No events yet — navigate to see scroll trace.</div>}
            {entries.map((e, i) => (
                <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ color: '#666' }}>{new Date(e.t).toISOString().slice(14, 23)} </span>
                    {e.line}
                </div>
            ))}
        </div>
    );
}
