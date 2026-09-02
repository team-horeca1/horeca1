'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ImageEditorModal } from '@/components/ui/ImageEditorModal';
import type { ImagePreviewVariant } from '@/components/ui/ImagePreview';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';

// Shared image uploader with:
//  • Click-to-upload dashed dropzone (or a thumbnail with hover Adjust/Replace overlay when filled)
//  • X button to remove
//  • Auto-opens ImageEditorModal after upload so the user can set focal point + zoom
//  • Display style of the thumbnail respects the saved focal point
//
// Used by both admin/brands and vendor/settings so the edit-photo UX is identical
// across the two portals.

export function ImageUploadField({
    label,
    value,
    onChange,
    folder,
    aspectHint,
    variant,
}: {
    label: string;
    value: string | null;
    onChange: (url: string | null) => void;
    folder: string;
    aspectHint?: string;
    /** Frontend variant — used by the editor's live preview to render at the right size + shape. */
    variant: ImagePreviewVariant;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [editing, setEditing] = useState(false);

    const handleFile = async (file: File) => {
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('folder', folder);
            const res = await fetch('/api/v1/upload', { method: 'POST', body: fd });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Upload failed');
            onChange(json.data.url);
            // Auto-open the editor so the user can immediately set focal point + zoom.
            setEditing(true);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const previewStyle = value ? getDisplayStyle(parseImageMeta(value).meta) : {};

    return (
        <div className="space-y-2">
            <label className="text-[13px] font-semibold text-gray-700">{label}</label>
            {aspectHint && <p className="text-[11px] text-gray-400">{aspectHint}</p>}

            <div
                className={cn(
                    'relative border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden group',
                    'hover:border-primary transition-colors',
                    value ? 'h-[160px]' : 'h-[120px] flex items-center justify-center bg-gray-50 cursor-pointer'
                )}
                onClick={() => !value && inputRef.current?.click()}
            >
                {value ? (
                    <>
                        <Image src={value} alt={label} fill className="object-cover" sizes="400px" style={previewStyle} />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 rounded-lg text-[12px] font-bold text-[#181725] hover:bg-white"
                            >
                                <Crosshair size={12} className="text-primary" /> Adjust
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 rounded-lg text-[12px] font-bold text-[#181725] hover:bg-white"
                            >
                                <Upload size={12} className="text-primary" /> Replace
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onChange(null); }}
                            className="absolute top-2 right-2 w-7 h-7 bg-white/95 rounded-full flex items-center justify-center shadow hover:bg-red-50 transition-colors z-10"
                        >
                            <X size={14} className="text-gray-600" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                        {uploading ? <Loader2 size={24} className="animate-spin text-primary" /> : <Upload size={24} />}
                        <span className="text-[12px] font-medium">{uploading ? 'Uploading…' : 'Click to upload'}</span>
                    </div>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />

            <ImageEditorModal
                open={editing && !!value}
                src={value}
                variant={variant}
                title={`Adjust ${label.toLowerCase()}`}
                onSave={(updated) => { onChange(updated); setEditing(false); }}
                onCancel={() => setEditing(false)}
            />
        </div>
    );
}
