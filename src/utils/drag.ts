import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Initiates native macOS window dragging using both the custom Rust command and core window API.
 */
export const handleWindowDrag = (e: React.MouseEvent) => {
  // Only trigger on primary / left mouse button
  if (e.button === 0) {
    const target = e.target as HTMLElement;

    // Check if the click originated on an interactive element
    const isInteractive =
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      Boolean(target.closest('button')) ||
      Boolean(target.closest('input')) ||
      Boolean(target.closest('select')) ||
      Boolean(target.closest('textarea')) ||
      Boolean(target.closest('[data-no-drag]'));

    if (!isInteractive) {
      // 1. Direct Rust IPC command
      invoke('drag_window').catch(() => {});
      // 2. Tauri Core window API
      getCurrentWindow().startDragging().catch(() => {});
    }
  }
};

/**
 * Handles double click on the titlebar to toggle maximize/zoom (macOS standard behavior)
 */
export const handleTitlebarDoubleClick = async (e: React.MouseEvent) => {
  const target = e.target as HTMLElement;
  const isInteractive =
    target.tagName === 'BUTTON' ||
    target.tagName === 'INPUT' ||
    Boolean(target.closest('button')) ||
    Boolean(target.closest('input')) ||
    Boolean(target.closest('[data-no-drag]'));

  if (!isInteractive) {
    const win = getCurrentWindow();
    const isMax = await win.isMaximized();
    if (isMax) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }
};
