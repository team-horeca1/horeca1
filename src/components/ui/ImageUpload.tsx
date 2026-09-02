'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2, ImageIcon, Plus, Link2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { ImageFolder } from '@/lib/imagekit';

interface ImageUploadProps {
    value: string; // current image URL
    onChange: (url: string) => void;
    folder?: ImageFolder;
    label?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
}

interface MultiImageUploadProps {
    values: string[];
    onChange: (urls: string[]) => void;
    folder?: ImageFolder;
    label?: string;
    max?: number;
    disabled?: boolean;
}

async function uploadFile(file: File, folder: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const res = await fetch('/api/v1/upload', { method: 'POST', body: formData });
    const json = await res.json();

    if (!json.success) {
        throw new Error(json.error?.message || 'Upload failed');
    }

    return json.data.url;
}

// ─── Single Image Upload ─────────────────────────────────────────────────

export function ImageUpload({
    value,
    onChange,
    folder = 'misc',
    label,
    className,
    size = 'md',
    disabled,
}: ImageUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [urlValue, setUrlValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleUrlSubmit = useCallback(() => {
        const trimmed = urlValue.trim();
        if (!trimmed) return;
        try {
            new URL(trimmed);
        } catch {
            setError('Please enter a valid URL');
            return;
        }
        setError('');
        onChange(trimmed);
        setUrlValue('');
        setShowUrlInput(false);
    }, [urlValue, onChange]);

    const sizeMap = {
        sm: { box: 'w-[80px] h-[80px]', icon: 16, text: '10px' },
        md: { box: 'w-[120px] h-[120px]', icon: 22, text: '11px' },
        lg: { box: 'w-full h-[180px]', icon: 28, text: '12px' },
    };
    const s = sizeMap[size];

    const handleUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setError('Only image files are allowed');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError('Max file size is 10MB');
            return;
        }

        setUploading(true);
        setError('');
        try {
            const url = await uploadFile(file, folder);
            onChange(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    }, [folder, onChange]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleUpload(file);
    };

    return (
        <div className={className}>
            {label && (
                <label className="block text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider mb-2">
                    {label}
                </label>
            )}

            {value ? (
                <div className={cn('relative rounded-[12px] overflow-hidden border border-[#EEEEEE] group', s.box, disabled && 'opacity-60')}>
                    <img
                        src={value}
                        alt="Uploaded"
                        className="w-full h-full object-cover"
                    />
                    {!disabled && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="w-[32px] h-[32px] rounded-[8px] bg-white/90 flex items-center justify-center text-[#181725] hover:bg-white transition-colors"
                            title="Replace image"
                        >
                            <Upload size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange('')}
                            className="w-[32px] h-[32px] rounded-[8px] bg-white/90 flex items-center justify-center text-[#E74C3C] hover:bg-white transition-colors"
                            title="Remove image"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    )}
                    {uploading && (
                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                            <Loader2 size={20} className="animate-spin text-primary" />
                        </div>
                    )}
                </div>
            ) : showUrlInput ? (
                <div className={cn('rounded-[12px] border border-[#DCDCDC] p-3 flex flex-col gap-2', size === 'sm' ? 'w-[200px]' : size === 'md' ? 'w-[280px]' : 'w-full')}>
                    <div className="flex items-center gap-2">
                        <Link2 size={14} className="text-primary shrink-0" />
                        <span className="text-[12px] font-semibold text-[#555]">Paste image URL</span>
                    </div>
                    <div className="flex gap-1.5">
                        <input
                            type="url"
                            value={urlValue}
                            onChange={(e) => { setUrlValue(e.target.value); setError(''); }}
                            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                            placeholder="https://..."
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-[12px] border border-[#DCDCDC] rounded-[8px] outline-none focus:border-primary transition-colors"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleUrlSubmit}
                            className="px-2.5 py-1.5 rounded-[8px] bg-primary text-white hover:bg-primary-dark transition-colors"
                        >
                            <Check size={14} />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setShowUrlInput(false); setUrlValue(''); setError(''); }}
                        className="text-[11px] text-[#AEAEAE] hover:text-[#555] self-start transition-colors"
                    >
                        Back to file upload
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    <div
                        onClick={() => !uploading && !disabled && inputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { if (!disabled) handleDrop(e); else e.preventDefault(); }}
                        className={cn(
                            'rounded-[12px] border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all',
                            s.box,
                            dragOver
                                ? 'border-primary bg-primary-light'
                                : 'border-[#DCDCDC] hover:border-primary/40 hover:bg-[#F8F9FB]',
                            uploading && 'pointer-events-none opacity-60',
                            disabled && 'pointer-events-none opacity-60 cursor-not-allowed',
                        )}
                    >
                        {uploading ? (
                            <Loader2 size={s.icon} className="animate-spin text-primary" />
                        ) : (
                            <>
                                <ImageIcon size={s.icon} className="text-[#AEAEAE]" />
                                <span className={cn('text-[#AEAEAE] font-medium', `text-[${s.text}]`)}>
                                    {size === 'sm' ? 'Upload' : 'Click or drop image'}
                                </span>
                            </>
                        )}
                    </div>
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => setShowUrlInput(true)}
                            className="flex items-center justify-center gap-1.5 text-[11px] text-[#AEAEAE] hover:text-primary font-medium transition-colors"
                        >
                            <Link2 size={12} />
                            <span>Use image URL</span>
                        </button>
                    )}
                </div>
            )}

            {error && (
                <p className="text-[11px] text-[#E74C3C] font-medium mt-1.5">{error}</p>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
}

// ─── Multi Image Upload ──────────────────────────────────────────────────

export function MultiImageUpload({
    values,
    onChange,
    folder = 'misc',
    label,
    max = 8,
    disabled,
}: MultiImageUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [urlValue, setUrlValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleUrlSubmit = useCallback(() => {
        const trimmed = urlValue.trim();
        if (!trimmed) return;
        try {
            new URL(trimmed);
        } catch {
            setError('Please enter a valid URL');
            return;
        }
        if (values.length >= max) {
            setError(`Maximum ${max} images allowed`);
            return;
        }
        setError('');
        onChange([...values, trimmed]);
        setUrlValue('');
        setShowUrlInput(false);
    }, [urlValue, onChange, values, max]);

    const handleFiles = useCallback(async (files: FileList) => {
        const remaining = max - values.length;
        if (remaining <= 0) {
            setError(`Maximum ${max} images allowed`);
            return;
        }

        const toUpload = Array.from(files).slice(0, remaining);
        setUploading(true);
        setError('');

        try {
            const urls: string[] = [];
            for (const file of toUpload) {
                if (!file.type.startsWith('image/')) continue;
                if (file.size > 10 * 1024 * 1024) continue;
                const url = await uploadFile(file, folder);
                urls.push(url);
            }
            onChange([...values, ...urls]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    }, [folder, max, onChange, values]);

    const removeImage = (index: number) => {
        onChange(values.filter((_, i) => i !== index));
    };

    return (
        <div>
            {label && (
                <label className="block text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider mb-2">
                    {label}
                </label>
            )}

            <div className="flex flex-wrap gap-3">
                {values.map((url, idx) => (
                    <div key={idx} className={cn('relative w-[80px] h-[80px] rounded-[10px] overflow-hidden border border-[#EEEEEE] group', disabled && 'opacity-60')}>
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        {!disabled && (
                        <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 w-[20px] h-[20px] rounded-full bg-[#E74C3C] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X size={12} />
                        </button>
                        )}
                    </div>
                ))}

                {values.length < max && !disabled && !showUrlInput && (
                    <div className="flex flex-col gap-1">
                        <div
                            onClick={() => !uploading && inputRef.current?.click()}
                            className={cn(
                                'w-[80px] h-[80px] rounded-[10px] border-2 border-dashed border-[#DCDCDC] flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/40 hover:bg-[#F8F9FB] transition-all',
                                uploading && 'pointer-events-none opacity-60',
                            )}
                        >
                            {uploading ? (
                                <Loader2 size={16} className="animate-spin text-primary" />
                            ) : (
                                <>
                                    <Plus size={16} className="text-[#AEAEAE]" />
                                    <span className="text-[10px] text-[#AEAEAE] font-medium">Add</span>
                                </>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowUrlInput(true)}
                            className="flex items-center justify-center gap-1 text-[10px] text-[#AEAEAE] hover:text-primary font-medium transition-colors"
                        >
                            <Link2 size={10} />
                            <span>URL</span>
                        </button>
                    </div>
                )}

                {showUrlInput && values.length < max && !disabled && (
                    <div className="flex items-center gap-1.5 min-w-[220px]">
                        <input
                            type="url"
                            value={urlValue}
                            onChange={(e) => { setUrlValue(e.target.value); setError(''); }}
                            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                            placeholder="https://..."
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-[12px] border border-[#DCDCDC] rounded-[8px] outline-none focus:border-primary transition-colors"
                            autoFocus
                        />
                        <button type="button" onClick={handleUrlSubmit} className="p-1.5 rounded-[8px] bg-primary text-white hover:bg-primary-dark transition-colors">
                            <Check size={14} />
                        </button>
                        <button type="button" onClick={() => { setShowUrlInput(false); setUrlValue(''); setError(''); }} className="p-1.5 rounded-[8px] text-[#AEAEAE] hover:text-[#555] transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <p className="text-[11px] text-[#E74C3C] font-medium mt-1.5">{error}</p>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files?.length) handleFiles(e.target.files);
                    e.target.value = '';
                }}
            />
        </div>
    );
}
