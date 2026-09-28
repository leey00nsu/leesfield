import { useCanvasTranslation } from "../../leesfield/localization";
import { CanvasSelect, CanvasTextarea } from "../../leesfield/inputs";
import { createPortal } from "react-dom";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AvailableVariable } from "../../leesfield/upstream-node-host";
import { usePromptAutocomplete } from "../../hooks/usePromptAutocomplete";

const DEFAULT_FONT_SIZE = 14;
const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 24];

interface PromptConstructorEditorModalProps {
  isOpen: boolean;
  readOnly?: boolean;
  initialTemplate: string;
  availableVariables: AvailableVariable[];
  onSubmit: (template: string) => void;
  onClose: () => void;
}

export const PromptConstructorEditorModal: React.FC<PromptConstructorEditorModalProps> = ({
  isOpen,
  readOnly = false,
  initialTemplate,
  availableVariables,
  onSubmit,
  onClose,
}) => {
  const tc = useCanvasTranslation();
  const [template, setTemplate] = useState(initialTemplate);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setTemplate(initialTemplate); setShowConfirmation(false); }, [isOpen, initialTemplate]);

  const hasUnsavedChanges = !readOnly && template !== initialTemplate;

  const {
    showAutocomplete,
    autocompletePosition,
    filteredAutocompleteVars,
    selectedAutocompleteIndex,
    handleChange: autocompleteHandleChange,
    handleKeyDown: autocompleteHandleKeyDown,
    handleAutocompleteSelect,
    closeAutocomplete,
  } = usePromptAutocomplete({
    availableVariables,
    textareaRef,
    localTemplate: template,
    setLocalTemplate: setTemplate,
  });

  // Unresolved variables
  const unresolvedVars = useMemo(() => {
    const varPattern = /@(\w+)/g;
    const unresolved: string[] = [];
    const matches = template.matchAll(varPattern);
    const availableNames = new Set(availableVariables.map((v) => v.name));

    for (const match of matches) {
      const varName = match[1];
      if (!availableNames.has(varName) && !unresolved.includes(varName)) {
        unresolved.push(varName);
      }
    }
    return unresolved;
  }, [template, availableVariables]);

  // Resolved preview
  const resolvedPreview = useMemo(() => {
    const values = new Map(availableVariables.map((variable) => [variable.name, variable.value]));
    return template.replace(/@(\w+)/g, (token, name) => values.get(name) ?? token);
  }, [template, availableVariables]);

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
    onSubmit(template);
    onClose();
  }, [template, onSubmit, onClose, readOnly]);

  const handleFontSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFontSize(parseInt(e.target.value, 10));
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
      if (e.target === e.currentTarget) {
        handleDismissConfirmation();
      }
    },
    [handleDismissConfirmation]
  );

  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (cursorTimer.current) clearTimeout(cursorTimer.current); }, [isOpen]);

  // Insert @varName at cursor when clicking a variable pill
  const handleVariablePillClick = useCallback(
    (varName: string) => {
      if (readOnly || !textareaRef.current) return;
      const ta = textareaRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const insertion = `@${varName}`;
      const newTemplate = template.slice(0, start) + insertion + template.slice(end);
      setTemplate(newTemplate);

      const newCursorPos = start + insertion.length;
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => {
        if (!ta.isConnected) return;
        ta.focus();
        ta.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [template, readOnly]
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div ref={dialogRef} data-canvas-dialog-content="" role="dialog" aria-modal="true" aria-label={tc("Edit Prompt Constructor")} className="relative bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center gap-3">
          <h2 className="text-xl font-semibold text-neutral-100">{tc("Edit Prompt Constructor")}</h2>
          {unresolvedVars.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-900/30 border border-amber-700/50 rounded text-[11px] text-amber-400">{tc("Unresolved:")}{unresolvedVars.map((v) => `@${v}`).join(", ")}
            </span>
          )}
        </div>

        {/* Box containing toolbar and textarea */}
        <div className="mx-6 flex-1 flex flex-col border border-neutral-700 rounded bg-neutral-900/30 overflow-hidden mb-4">
          {/* Toolbar */}
          <div className="min-h-[48px] bg-neutral-900 border-b border-neutral-700 flex items-center px-4 gap-3 shrink-0 flex-wrap py-2">
            {/* Font Size Control */}
            <CanvasSelect
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

            {/* Divider */}
            {availableVariables.length > 0 && (
              <div className="w-px h-5 bg-neutral-700" />
            )}

            {/* Variable pills */}
            {availableVariables.map((v) => (
              <button
                key={v.nodeId}
                onClick={() => handleVariablePillClick(v.name)}
                className="px-2 py-0.5 text-[11px] text-blue-400 bg-blue-900/20 border border-blue-700/40 rounded hover:bg-blue-900/40 transition-colors"
                title={v.value || "(empty)"}
              >
                @{v.name}
              </button>
            ))}
          </div>

          {/* Textarea with autocomplete */}
          <div className="relative flex-1 flex flex-col">
            <CanvasTextarea
              ref={textareaRef}
                readOnly={readOnly}
              value={template}
              onChange={autocompleteHandleChange}
              onKeyDown={autocompleteHandleKeyDown}
              placeholder={tc("Type @ to insert variables...")}
              className="nodrag nopan nowheel flex-1 w-full p-6 leading-relaxed text-neutral-100 bg-transparent border-0 resize-none focus:outline-none placeholder:text-neutral-500"
              style={{ fontSize: `${fontSize}px` }}
              autoFocus
            />

            {/* Autocomplete dropdown */}
            {showAutocomplete && filteredAutocompleteVars.length > 0 && (
              <div
                className="absolute z-10 bg-neutral-800 border border-neutral-600 rounded shadow-xl max-h-40 overflow-y-auto"
                style={{
                  top: autocompletePosition.top + 16,
                  left: autocompletePosition.left + 24,
                }}
              >
                {filteredAutocompleteVars.map((variable, index) => (
                  <button
                    key={variable.nodeId}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleAutocompleteSelect(variable.name);
                    }}
                    className={`w-full px-3 py-2 text-left text-[11px] flex flex-col gap-0.5 transition-colors ${
                      index === selectedAutocompleteIndex
                        ? "bg-neutral-700 text-neutral-100"
                        : "text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <div className="font-medium text-blue-400">@{variable.name}</div>
                    <div className="text-neutral-500 truncate max-w-[200px]">
                      {variable.value || "(empty)"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Resolved preview */}
        {availableVariables.length > 0 && (
          <div className="mx-6 mb-4 border border-neutral-700 rounded bg-neutral-900/30 overflow-hidden">
            <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-700 text-[11px] text-neutral-400 uppercase tracking-wide font-semibold">{tc("Resolved Preview")}</div>
            <div className="p-4 text-sm text-neutral-300 whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
              {resolvedPreview || <span className="text-neutral-500 italic">{tc("Empty template")}</span>}
            </div>
          </div>
        )}

        {/* Footer with buttons */}
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            onClick={handleAttemptClose}
            className="px-4 py-2 text-sm font-medium text-neutral-300 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500"
          >{tc("Cancel")}</button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400"
          >{tc("Submit")}</button>
        </div>

        {/* Confirmation overlay */}
        {showConfirmation && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg"
            onClick={handleConfirmationBackdropClick}
          >
            <div ref={confirmationRef} role="dialog" aria-modal="true" aria-label={tc("Unsaved changes")} className="relative bg-neutral-800 border border-neutral-600 rounded-lg p-6 mx-4 max-w-sm shadow-xl">
              <button
                onClick={handleDismissConfirmation}
                className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-200 transition-colors focus:outline-none"
                aria-label={tc("Close")}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
