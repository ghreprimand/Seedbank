import { useEffect, useState } from 'react';
import { ChevronUp, Folder, FolderPlus, Home, Loader2, X } from 'lucide-react';
import {
  createProjectDirectory,
  listProjectDirectories,
  type DirectoryListing,
} from '@/api/client';

interface DirectoryPickerModalProps {
  title?: string;
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export default function DirectoryPickerModal({
  title = 'Choose folder',
  initialPath,
  onClose,
  onSelect,
}: DirectoryPickerModalProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [pathInput, setPathInput] = useState(initialPath ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadPath = async (pathValue?: string) => {
    setLoading(true);
    setError(null);
    try {
      const nextListing = await listProjectDirectories(pathValue);
      setListing(nextListing);
      setPathInput(nextListing.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that folder.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPath(initialPath);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialPath]);

  const createFolder = async () => {
    if (!listing || !newFolderName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createProjectDirectory(listing.path, newFolderName.trim());
      setNewFolderName('');
      await loadPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that folder.');
    } finally {
      setCreating(false);
    }
  };

  const selectedPath = listing?.path ?? pathInput.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink-900/35 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-picker-title"
        className="w-full max-w-2xl bg-paper border border-ink-100 rounded-card shadow-modal overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-ink-100">
          <div>
            <h2 id="directory-picker-title" className="text-lg font-serif font-semibold text-ink-900">
              {title}
            </h2>
            <p className="text-xs text-ink-400 mt-0.5">
              Browse folders from the local Seedbank server.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-600 rounded-card hover:bg-ink-50"
            aria-label="Close folder browser"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 bg-paper-warm">
          <div className="flex gap-2">
            <input
              type="text"
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadPath(pathInput);
              }}
              className="min-w-0 flex-1 px-3 py-2 text-sm bg-paper border border-ink-100
                         rounded-card outline-none focus:ring-2 focus:ring-sage-400"
              aria-label="Folder path"
            />
            <button
              type="button"
              onClick={() => void loadPath(pathInput)}
              disabled={loading || !pathInput.trim()}
              className="inline-flex items-center px-3 py-2 text-sm font-medium bg-paper
                         border border-ink-200 rounded-card text-ink-600 hover:text-ink-800
                         hover:border-ink-300 disabled:opacity-50"
            >
              Go
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => listing?.homePath && void loadPath(listing.homePath)}
              disabled={loading || !listing?.homePath}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                         bg-paper border border-ink-200 rounded-card text-ink-600
                         hover:text-ink-800 disabled:opacity-50"
            >
              <Home className="w-3.5 h-3.5" />
              Home
            </button>
            <button
              type="button"
              onClick={() => listing?.parentPath && void loadPath(listing.parentPath)}
              disabled={loading || !listing?.parentPath}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                         bg-paper border border-ink-200 rounded-card text-ink-600
                         hover:text-ink-800 disabled:opacity-50"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              Up
            </button>
          </div>

          <div className="h-72 overflow-auto bg-paper border border-ink-100 rounded-card">
            {loading && (
              <div className="h-full flex items-center justify-center gap-2 text-sm text-ink-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading folders...
              </div>
            )}
            {!loading && listing && listing.entries.length === 0 && (
              <div className="h-full flex items-center justify-center text-sm text-ink-400">
                No child folders in this folder.
              </div>
            )}
            {!loading && listing && listing.entries.length > 0 && (
              <div className="divide-y divide-ink-50">
                {listing.entries.map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => void loadPath(entry.path)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                               text-ink-700 hover:bg-sage-50 hover:text-sage-800"
                  >
                    <Folder className="w-4 h-4 text-sage-600 shrink-0" />
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createFolder();
              }}
              placeholder="New folder name"
              disabled={!listing || creating}
              className="min-w-0 flex-1 px-3 py-2 text-sm bg-paper border border-ink-100
                         rounded-card outline-none focus:ring-2 focus:ring-sage-400
                         placeholder:text-ink-300 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void createFolder()}
              disabled={!listing || creating || !newFolderName.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                         bg-paper border border-ink-200 hover:border-ink-300 text-ink-600
                         hover:text-ink-800 rounded-card disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
              Create
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-card text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-paper border-t border-ink-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-ink-500 hover:text-ink-700 rounded-card hover:bg-ink-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => selectedPath && onSelect(selectedPath)}
            disabled={!selectedPath}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                       bg-sage-600 hover:bg-sage-700 text-paper rounded-card disabled:opacity-50"
          >
            <Folder className="w-4 h-4" />
            Select folder
          </button>
        </div>
      </div>
    </div>
  );
}
