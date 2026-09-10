'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'chef', label: 'Chef of the Week' },
  { value: 'consultant', label: 'Consultant Spotlight' },
  { value: 'vendor', label: 'Vendor Spotlight' },
  { value: 'owner', label: 'F&B Owner / Restaurateur Spotlight' },
] as const;

export default function NominateVoicePage() {
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setPending(true);
    try {
      const res = await fetch('/api/v1/voices/nominations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomineeName: data.nomineeName,
          category: data.category,
          contact: data.contact,
          reason: data.reason,
          nominatorName: data.nominatorName,
          relationship: data.relationship,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        toast.error(json?.error?.message || 'Could not send nomination');
        return;
      }
      setSubmitted(true);
    } catch {
      toast.error('Could not send nomination');
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-bold text-primary text-balance">Thank you</h1>
          <p className="mt-3 text-text-secondary text-pretty">
            Our editorial team will review this nomination. It is not published automatically.
          </p>
          <Link href="/voices" className="inline-block mt-8 text-primary font-semibold hover:underline">
            Back to Voices
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-bold text-primary text-balance">Nominate a Voice</h1>
        <p className="mt-2 text-[14px] text-text-secondary text-pretty">
          Tell us about someone in HORECA worth featuring. No login required.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-text">Nominee name</span>
            <input
              name="nomineeName"
              required
              className="mt-1 w-full h-11 rounded-xl border border-divider px-3 text-[14px] bg-white"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-text">Category</span>
            <select
              name="category"
              required
              className="mt-1 w-full h-11 rounded-xl border border-divider px-3 text-[14px] bg-white"
              defaultValue="chef"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-text">Email or phone</span>
            <input
              name="contact"
              required
              className="mt-1 w-full h-11 rounded-xl border border-divider px-3 text-[14px] bg-white"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-text">Why should they be featured?</span>
            <textarea
              name="reason"
              required
              minLength={10}
              rows={4}
              className="mt-1 w-full rounded-xl border border-divider px-3 py-2 text-[14px] bg-white"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-text">Your name (optional)</span>
            <input name="nominatorName" className="mt-1 w-full h-11 rounded-xl border border-divider px-3 text-[14px] bg-white" />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-text">Your relationship (optional)</span>
            <input name="relationship" className="mt-1 w-full h-11 rounded-xl border border-divider px-3 text-[14px] bg-white" />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full h-12 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Submit nomination'}
          </button>
        </form>
      </div>
    </div>
  );
}
