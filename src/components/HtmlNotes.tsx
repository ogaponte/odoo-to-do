import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { ImageViewer } from './ImageViewer';
import { Bold, Italic, Underline, List, ListOrdered, Link, RemoveFormatting, Undo2, Redo2, ImagePlus } from 'lucide-react';
import { imagesToHtml } from '../utils/noteImages';

interface HtmlNotesProps {
  value: string;
  baseUrl?: string;
  onChange: (html: string) => void;
}

// Odoo stores image and link URLs relative to its own server.
function renderNotes(value: string, baseUrl?: string): string {
  const fragment = DOMPurify.sanitize(value, { RETURN_DOM_FRAGMENT: true });
  if (baseUrl) {
    for (const element of fragment.querySelectorAll('[src], [href]')) {
      for (const attribute of ['src', 'href']) {
        const url = element.getAttribute(attribute);
        if (!url) continue;
        try {
          element.setAttribute(attribute, new URL(url, `${baseUrl.replace(/\/$/, '')}/`).href);
        } catch {
          element.removeAttribute(attribute);
        }
      }
    }
  }
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

export function HtmlNotes({ value, baseUrl, onChange }: HtmlNotesProps) {
  const editor = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const savedSelection = useRef<Range | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  const [imageError, setImageError] = useState('');
  const [readingImages, setReadingImages] = useState(false);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);

  useEffect(() => {
    if (editor.current && value !== lastEmitted.current) {
      editor.current.innerHTML = renderNotes(value, baseUrl);
    }
  }, [value, baseUrl]);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.current?.contains(selection.anchorNode)
      || !editor.current.contains(selection.focusNode)) return;
    savedSelection.current = selection.getRangeAt(0).cloneRange();
    setActiveFormats(['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList']
      .filter((command) => document.queryCommandState(command)));
  };

  useEffect(() => {
    document.addEventListener('selectionchange', rememberSelection);
    return () => document.removeEventListener('selectionchange', rememberSelection);
  }, []);

  const restoreSelection = (range = savedSelection.current) => {
    if (!editor.current) return;
    editor.current.focus();
    const selection = window.getSelection();
    if (!selection) return;
    if (!range || !editor.current.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor.current);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const emitChange = () => {
    if (!editor.current) return;
    const html = DOMPurify.sanitize(editor.current.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  };

  const runCommand = (command: string, argument?: string) => {
    restoreSelection();
    document.execCommand(command, false, argument);
    emitChange();
    rememberSelection();
  };

  const insertHtml = (html: string, range?: Range | null) => {
    if (!editor.current) return;
    restoreSelection(range);
    document.execCommand('insertHTML', false, DOMPurify.sanitize(html));
    emitChange();
    rememberSelection();
  };

  const insertImages = async (files: File[], range: Range | null) => {
    setImageError('');
    setReadingImages(true);
    try {
      const html = await imagesToHtml(files);
      // The task may have been closed while FileReader was working.
      if (!editor.current) return;
      insertHtml(html, range);
    } catch (error) {
      if (editor.current) setImageError(error instanceof Error ? error.message : 'Could not insert the image.');
    } finally {
      if (editor.current) setReadingImages(false);
    }
  };

  const addLink = () => {
    const url = window.prompt('Enter a link URL (https://… or mailto:…)');
    if (!url) return;
    try {
      const parsed = new URL(url.trim());
      if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) throw new Error();
      setImageError('');
      restoreSelection();
      if (window.getSelection()?.isCollapsed) {
        const anchor = document.createElement('a');
        anchor.href = parsed.href;
        anchor.textContent = url.trim();
        insertHtml(anchor.outerHTML);
      } else runCommand('createLink', parsed.href);
    } catch {
      setImageError('Enter a valid HTTP, HTTPS or email link.');
    }
  };

  const tools = [
    { command: 'bold', label: 'Bold (Cmd+B)', Icon: Bold },
    { command: 'italic', label: 'Italic (Cmd+I)', Icon: Italic },
    { command: 'underline', label: 'Underline (Cmd+U)', Icon: Underline },
    { command: 'insertUnorderedList', label: 'Bulleted list', Icon: List },
    { command: 'insertOrderedList', label: 'Numbered list', Icon: ListOrdered },
    { command: 'removeFormat', label: 'Clear formatting', Icon: RemoveFormatting },
    { command: 'undo', label: 'Undo', Icon: Undo2 },
    { command: 'redo', label: 'Redo', Icon: Redo2 },
  ];

  return (
    <>
    <div role="toolbar" aria-label="Notes formatting" className="notes-toolbar flex flex-wrap items-center gap-1 rounded-xl border border-black/8 dark:border-white/10 bg-white/20 dark:bg-black/15 p-1.5 mb-2">
      {tools.map(({ command, label, Icon }) => (
        <button key={command} type="button" title={label} aria-label={label}
          aria-pressed={['undo', 'redo', 'removeFormat'].includes(command) ? undefined : activeFormats.includes(command)}
          onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(command)}>
          <Icon size={17} />
        </button>
      ))}
      <button type="button" title="Insert link" aria-label="Insert link"
        onMouseDown={(event) => event.preventDefault()} onClick={addLink}><Link size={17} /></button>
      <button type="button" title="Insert image" aria-label="Insert image" disabled={readingImages}
        onMouseDown={(event) => event.preventDefault()} onClick={() => fileInput.current?.click()}><ImagePlus size={17} /></button>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          if (files.length) void insertImages(files, savedSelection.current?.cloneRange() || null);
          event.currentTarget.value = '';
        }} />
    </div>
    <p className="text-[13px] text-zinc-500 mb-2">Paste images with Cmd+V or insert a file. PNG, JPEG, GIF or WebP · up to 5 MB each.</p>
    {readingImages && <p role="status" className="text-sm text-zinc-500 mb-2">Inserting images…</p>}
    {imageError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400 mb-2">{imageError}</p>}
    <div
      ref={editor}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Notes and description"
      aria-multiline="true"
      data-placeholder="Write notes, format text or paste images (Cmd+V)..."
      onKeyUp={rememberSelection}
      onMouseUp={rememberSelection}
      onBlur={rememberSelection}
      onInput={emitChange}
      onDrop={(event) => event.preventDefault()}
      onMouseDown={(event) => {
        if (event.target instanceof HTMLImageElement) event.preventDefault();
      }}
      onClickCapture={(event) => {
        if (event.target instanceof HTMLImageElement) {
          event.preventDefault();
          event.stopPropagation();
          setImage({ src: event.target.currentSrc || event.target.src, alt: event.target.alt });
        }
      }}
      onPaste={(event) => {
        // Sanitize before inserting clipboard HTML into the live editor.
        event.preventDefault();
        rememberSelection();
        const files = Array.from(event.clipboardData.items)
          .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
          .map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
        if (files.length) {
          void insertImages(files, savedSelection.current?.cloneRange() || null);
          return;
        }
        const html = event.clipboardData.getData('text/html');
        const text = event.clipboardData.getData('text/plain');
        if (html) insertHtml(renderNotes(html, baseUrl));
        else runCommand('insertText', text);
      }}
      className="html-notes w-full min-h-64 flex-1 rounded-xl bg-white/25 dark:bg-black/15 backdrop-blur-md border border-black/8 dark:border-white/10 p-4 text-base text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 leading-relaxed font-sans shadow-2xs"
    />
    {image && <ImageViewer src={image.src} alt={image.alt} onClose={() => setImage(null)} />}
    </>
  );
}
