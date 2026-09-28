import { useCanvasTranslation } from "../../leesfield/localization";
import { CanvasSelect, CanvasTextarea } from "../../leesfield/inputs";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

const DEFAULT_FONT_SIZE = 14;
const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 24];

interface PromptEditorModalProps {
  isOpen: boolean;
  initialPrompt: string;
  readOnly?: boolean;
  onSubmit: (prompt: string) => void;
  onClose: () => void;
}

export const PromptEditorModal: React.FC<PromptEditorModalProps> = ({
  isOpen,
  initialPrompt,
  readOnly = false,
  onSubmit,
  onClose,
}) => {
  const tc = useCanvasTranslation();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update local state when initial prompt changes
  useEffect(() => {
    setPrompt(initialPrompt);
    setShowConfirmation(false);
  }, [isOpen, initialPrompt, readOnly]);

  // Track unsaved changes
  const hasUnsavedChanges = !readOnly && prompt !== initialPrompt;

  // Handle close attempt - show confirmation if there are unsaved changes
  const handleAttemptClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowConfirmation(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  const closeAttemptRef = useRef(handleAttemptClose);
  useEffect(() => { closeAttemptRef.current = handleAttemptClose; }, [handleAttemptClose]);

  // One focus boundary survives callback changes; the confirmation becomes
  // the active boundary while open. Escape dismisses only that top layer.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeDialog = () => confirmationRef.current ?? dialogRef.current;
    const controls = () => Array.from(activeDialog()?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? []);
    (textareaRef.current?.disabled ? controls()[0] : textareaRef.current)?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeDialog()?.querySelector('[role="listbox"]')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (confirmationRef.current) setShowConfirmation(false);
        else closeAttemptRef.current();
      }
      if (e.key === 'Tab') {
        const items = controls(), first = items[0], last = items.at(-1);
        if (e.shiftKey && (document.activeElement === first || !activeDialog()?.contains(document.activeElement))) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !activeDialog()?.contains(document.activeElement))) {
          e.preventDefault(); first?.focus();
        }
      }
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Node && !activeDialog()?.contains(event.target)) controls()[0]?.focus();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', focus);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', focus);
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !showConfirmation) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmationRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous?.isConnected && dialogRef.current?.contains(previous)) previous.focus(); };
  }, [isOpen, showConfirmation]);

  const handleSubmit = useCallback(() => {
    if (readOnly) return;
    onSubmit(prompt);
    onClose();
  }, [prompt, onSubmit, onClose, readOnly]);

  const handleFontSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFontSize(parseInt(e.target.value, 10));
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only close if clicking the backdrop itself, not the dialog content
      if (e.target === e.currentTarget) {
        handleAttemptClose();
      }
    },
    [handleAttemptClose]
  );

  const handleDismissConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const handleConfirmationBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only dismiss if clicking the backdrop itself, not the confirmation dialog
      if (e.target === e.currentTarget) {
        handleDismissConfirmation();
      }
    },
    [handleDismissConfirmation]
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={tc("Edit Prompt")}
    >
      <div ref={dialogRef} data-canvas-dialog-content="" className="relative bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-xl font-semibold text-neutral-100">{tc("Edit Prompt")}</h2>
        </div>

        {/* Box containing toolbar and textarea */}
        <div className="mx-6 flex-1 flex flex-col border border-neutral-700 rounded bg-neutral-900/30 overflow-hidden mb-4">
          {/* Toolbar - header of the box */}
          <div className="h-12 bg-neutral-900 border-b border-neutral-700 flex items-center px-4 gap-3 shrink-0">
            {/* Font Size Control */}
            <CanvasSelect
              aria-label={tc("Prompt font size")}
              value={fontSize}
              onChange={handleFontSizeChange}
              className="text-sm py-1 px-2 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300"
            >
              {FONT_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </CanvasSelect>
          </div>

          {/* Textarea */}
          <CanvasTextarea
            ref={textareaRef}
            aria-label={tc("Prompt text")}
            disabled={readOnly}
            value={prompt}
            onChange={(e) => { if (!readOnly) setPrompt(e.target.value); }}
            placeholder={tc("Describe what to generate...")}
            className="nodrag nopan nowheel flex-1 w-full p-6 leading-relaxed text-neutral-100 bg-transparent border-0 resize-none focus:outline-none placeholder:text-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontSize: `${fontSize}px` }}
          />
        </div>

        {/* Footer with buttons */}
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            onClick={handleAttemptClose}
            className="px-4 py-2 text-sm font-medium text-neutral-300 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500"
          >{tc("Cancel")}</button>
          <button
            onClick={handleSubmit}
            disabled={readOnly}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >{tc("Submit")}</button>
        </div>

        {/* Confirmation overlay */}
        {showConfirmation && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg"
            onClick={handleConfirmationBackdropClick}
          >
            <div ref={confirmationRef} role="dialog" aria-modal="true" aria-label={tc("Unsaved prompt changes")} className="relative bg-neutral-800 border border-neutral-600 rounded-lg p-6 mx-4 max-w-sm shadow-xl">
              {/* Close button */}
              <button
                onClick={handleDismissConfirmation}
                className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-200 transition-colors focus:outline-none"
                aria-label={tc("Close")}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              <p className="text-neutral-100 text-center mb-6">{tc("You have unsaved changes")}</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-neutral-300 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500"
                >{tc("Discard")}</button>
                <button
                  onClick={handleSubmit}
                  disabled={readOnly}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400"
                >{tc("Submit")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>, document.body
  );
};
