import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Upload, X } from 'lucide-react';
import { apiUrl, deleteIdeaImage, uploadIdeaImage } from '@/api/client';

type UploadState = 'idle' | 'uploading';

function filenameFromImagePath(imagePath: string): string {
  try {
    const url = new URL(imagePath, window.location.origin);
    const filename = url.pathname.split('/').pop() ?? '';
    return decodeURIComponent(filename);
  } catch {
    const filename = imagePath.split('/').pop() ?? '';
    return decodeURIComponent(filename);
  }
}

function imageSrc(imagePath: string): string {
  if (/^(https?:|data:|blob:)/i.test(imagePath)) return imagePath;
  if (imagePath.startsWith('/api/')) return apiUrl(imagePath);
  return imagePath;
}

interface ImageGalleryProps {
  ideaId: string;
  images: string[];
  onChange: (images: string[]) => void;
}

export default function ImageGallery({ ideaId, images, onChange }: ImageGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const hasImages = images.length > 0;
  const safeActiveIndex = activeIndex === null || images.length === 0
    ? null
    : Math.min(activeIndex, images.length - 1);
  const activeImage = useMemo(() => {
    if (safeActiveIndex === null) return null;
    return images[safeActiveIndex] ?? null;
  }, [safeActiveIndex, images]);

  useEffect(() => {
    if (safeActiveIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null);
      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => {
          if (current === null || images.length === 0) return current;
          return (current - 1 + images.length) % images.length;
        });
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => {
          if (current === null || images.length === 0) return current;
          return (current + 1) % images.length;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [safeActiveIndex, images.length]);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploadState('uploading');
    let latest = images;
    try {
      for (const file of Array.from(files)) {
        const result = await uploadIdeaImage(ideaId, file);
        latest = result.images;
      }
      onChange(latest);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setUploadState('idle');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (imagePath: string) => {
    const filename = filenameFromImagePath(imagePath);
    if (!filename) return;
    const confirmed = window.confirm('Delete this image from the idea?');
    if (!confirmed) return;

    try {
      const result = await deleteIdeaImage(ideaId, filename);
      onChange(result.images);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Image delete failed.');
    }
  };

  return (
    <div className="space-y-3" data-help="image-gallery">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider font-mono">
            Image Gallery
          </label>
          <p className="text-[11px] text-ink-300 mt-1">Upload concept art, mockups, screenshots, or reference visuals.</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(event) => {
              void handleUploadFiles(event.target.files);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState === 'uploading'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       border border-ink-200 text-ink-600 hover:border-sage-300 hover:text-sage-700
                       hover:bg-sage-50 rounded-card transition-colors disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploadState === 'uploading' ? 'Uploading…' : 'Upload images'}
          </button>
        </div>
      </div>

      {uploadError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-card px-2 py-1.5">
          {uploadError}
        </p>
      )}

      {!hasImages && (
        <div className="rounded-card border border-dashed border-ink-200 bg-paper-warm px-3 py-5 text-center text-xs text-ink-400">
          No images yet.
        </div>
      )}

      {hasImages && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {images.map((imagePath, index) => (
            <div key={`${imagePath}-${index}`} className="group relative rounded-card border border-ink-100 overflow-hidden bg-paper-warm">
              <button
                type="button"
                className="block w-full"
                onClick={() => setActiveIndex(index)}
              >
                <img src={imageSrc(imagePath)} alt="Idea attachment" className="w-full aspect-video object-cover" loading="lazy" />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(imagePath)}
                title="Delete image"
                className="absolute top-1.5 right-1.5 p-1 rounded-badge bg-paper/90 text-ink-500 hover:text-red-600 border border-ink-200 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeImage && safeActiveIndex !== null && (
        <div className="fixed inset-0 z-50 bg-ink-900/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActiveIndex(null)}>
          <button
            type="button"
            onClick={() => setActiveIndex(null)}
            className="absolute top-4 right-4 p-2 rounded-badge text-paper bg-ink-900/60 hover:bg-ink-900"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex((current) => (current === null ? 0 : (current - 1 + images.length) % images.length));
                }}
                className="absolute left-4 p-2 rounded-badge text-paper bg-ink-900/60 hover:bg-ink-900"
                title="Previous image"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex((current) => (current === null ? 0 : (current + 1) % images.length));
                }}
                className="absolute right-4 p-2 rounded-badge text-paper bg-ink-900/60 hover:bg-ink-900"
                title="Next image"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          <img
            src={imageSrc(activeImage)}
            alt="Idea attachment"
            className="max-w-full max-h-full rounded-card border border-paper/20 shadow-modal"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
