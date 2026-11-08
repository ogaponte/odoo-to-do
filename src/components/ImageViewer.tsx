import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [originalSize, setOriginalSize] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    const fullscreenTarget = surface.current;
    element?.showModal();
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === fullscreenTarget);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreen);
      if (document.fullscreenElement === fullscreenTarget) void document.exitFullscreen().catch(() => {});
      element?.close();
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === surface.current) await document.exitFullscreen();
      else await surface.current?.requestFullscreen();
    } catch {
      setError('Could not enter full screen. You can view the image at its original size.');
    }
  };

  return createPortal(
    <dialog
      ref={dialog}
      aria-label="Image preview"
      className="image-viewer"
      onCancel={onClose}
      onKeyDown={(event) => {
        // Escape closes the viewer without closing the task behind it.
        event.stopPropagation();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={surface} className="relative h-full w-full bg-zinc-950/95">
      <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-2 bg-black/65 p-3 text-white">
        <span className="min-w-0 flex-1 truncate text-base">{alt || 'Task image'}</span>
        <button type="button" className="image-viewer-button" onClick={() => setOriginalSize(!originalSize)}
          title={originalSize ? 'Fit to window' : 'Original size'} aria-label={originalSize ? 'Fit to window' : 'Original size'}>
          {originalSize ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
        </button>
        {document.fullscreenEnabled && (
          <button type="button" className="image-viewer-button" onClick={toggleFullscreen}
            title={fullscreen ? 'Exit full screen' : 'Full screen'} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>
            {fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        )}
        <button type="button" autoFocus className="image-viewer-button" onClick={onClose} title="Close (Esc)" aria-label="Close image">
          <X size={22} />
        </button>
      </div>
      <div className="image-viewer-content" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <img src={src} alt={alt} className={originalSize ? 'image-original' : 'image-fit'}
          onError={() => setError('Could not load the image from Odoo.')} />
      </div>
      {error && <p role="status" className="absolute bottom-3 inset-x-3 rounded-lg bg-black/80 p-3 text-center text-base text-white">{error}</p>}
      </div>
    </dialog>,
    document.body,
  );
}
