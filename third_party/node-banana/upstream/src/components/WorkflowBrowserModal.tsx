"use client";

import { WorkflowFile } from "@/store/workflowStore";
import { WorkflowBrowserView } from "./quickstart/WorkflowBrowserView";

interface WorkflowBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkflowLoaded: (workflow: WorkflowFile, directoryPath: string) => void;
}

export function WorkflowBrowserModal({
  isOpen,
  onClose,
  onWorkflowLoaded,
}: WorkflowBrowserModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onWheelCapture={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-browser-title"
        className="w-full max-w-2xl mx-4 bg-neutral-800 rounded-xl border border-neutral-700 shadow-2xl overflow-clip max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <WorkflowBrowserView
          onWorkflowLoaded={onWorkflowLoaded}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
