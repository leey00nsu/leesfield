"use client";

import { useCanvasTranslation } from "../../leesfield/localization";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { hostedTutorialSteps } from "../../leesfield/hosted-tutorial-steps";
import { ElementHighlight } from "./ElementHighlight";
import { TutorialMessage } from "./TutorialMessage";

/**
 * Main tutorial coordination component.
 * Manages tutorial progression, action detection, and UI rendering.
 */
export function TutorialOverlay({ nodes, edges, onClose }: {
  nodes: { id: string; type: string; data: Record<string, unknown> }[];
  edges: { source: string; target: string }[];
  onClose: () => void;
}) {
  const tc = useCanvasTranslation();
  const [mounted, setMounted] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentTutorialStep, setCurrentTutorialStep] = useState(0);
  const [tutorialSteps, setTutorialSteps] = useState(() => hostedTutorialSteps.map((step) => ({ ...step })));
  const tutorialActive = true;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const completeCurrentStep = useCallback(() => setTutorialSteps((steps) => steps.map((step, index) => index === currentTutorialStep ? { ...step, completed: true } : step)), [currentTutorialStep]);
  const nextTutorialStep = useCallback(() => setCurrentTutorialStep((step) => step + 1), []);
  const skipTutorial = useCallback(() => closeRef.current(), []);
  const [connectionMenuShown, setConnectionMenuShown] = useState(false);
  const nanoBananaAddedFromMenu = nodes.some((node) => node.type === "nanoBanana");
  useEffect(() => {
    const observer = new MutationObserver(() => { if (document.querySelector('[data-node-banana-component="ConnectionDropMenu"]')) setConnectionMenuShown(true); });
    observer.observe(document.body, { childList: true, subtree: true });
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); skipTutorial(); } };
    window.addEventListener("keydown", escape);
    return () => { observer.disconnect(); window.removeEventListener("keydown", escape); };
  }, [skipTutorial]);
  useEffect(() => { if (currentTutorialStep >= tutorialSteps.length) closeRef.current(); }, [currentTutorialStep, tutorialSteps.length]);

  // Ensure portal rendering only happens client-side
  useEffect(() => {
    setMounted(true);
  }, []);

  // Action detection: monitor workflow state for required actions
  useEffect(() => {
    if (!tutorialActive || currentTutorialStep >= tutorialSteps.length) {
      return;
    }

    const currentStep = tutorialSteps[currentTutorialStep];
    if (currentStep.completed) {
      return;
    }

    // Steps with waitForClick require manual progression
    if (currentStep.waitForClick) {
      return;
    }

    // Steps without requiredAction auto-advance after 3 seconds
    if (!currentStep.requiredAction) {
      const timer = setTimeout(() => {
        completeCurrentStep();
        nextTutorialStep();
      }, 3000);
      return () => clearTimeout(timer);
    }

    let actionCompleted = false;

    // Detect specific actions based on requiredAction type
    switch (currentStep.requiredAction) {
      case "add-image-node":
        actionCompleted = nodes.some((node) => node.type === "imageInput");
        break;

      case "add-output-node":
        actionCompleted = nodes.some((node) => node.type === "output");
        break;

      case "connect-nodes":
        // Check if any edges exist
        actionCompleted = edges.length > 0;
        break;

      case "run-workflow":
        // Check if any node has been executed (has output)
        actionCompleted = nodes.some((node) => {
          const data = node.data as Record<string, unknown>;
          return node.type === "nanoBanana" && Boolean(data.outputImage);
        });
        break;

      case "show-connection-menu":
        actionCompleted = connectionMenuShown;
        break;

      case "add-nanoBanana-from-menu":
        actionCompleted = nanoBananaAddedFromMenu;
        break;

      case "add-prompt-node":
        actionCompleted = nodes.some((node) => node.type === "prompt");
        break;

      case "connect-prompt-node":
        // Check if any edge has a prompt node as source
        actionCompleted = edges.some((edge) => {
          const sourceNode = nodes.find((n) => n.id === edge.source);
          return sourceNode?.type === "prompt";
        });
        break;
    }

    if (actionCompleted) {
      // Advance to next step after configurable delay (default 1000ms).
      // Both completeCurrentStep() and nextTutorialStep() are called inside
      // the timeout so that the state update doesn't trigger a re-render
      // whose cleanup would clear the pending timeout.
      const delay = currentStep.advanceDelay !== undefined ? currentStep.advanceDelay : 1000;
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = setTimeout(() => {
        advanceTimeoutRef.current = null;
        completeCurrentStep();
        nextTutorialStep();
      }, delay);
    }

    return () => {
      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }
    };
  }, [
    tutorialActive,
    currentTutorialStep,
    tutorialSteps,
    nodes,
    edges,
    connectionMenuShown,
    nanoBananaAddedFromMenu,
    completeCurrentStep,
    nextTutorialStep,
  ]);

  // Handle highlight delay
  useEffect(() => {
    if (!tutorialActive || currentTutorialStep >= tutorialSteps.length) {
      return;
    }

    const currentStep = tutorialSteps[currentTutorialStep];

    if (currentStep.highlightSelector && currentStep.highlightDelay) {
      // Start with highlight hidden
      setShowHighlight(false);
      // Show highlight after delay
      const timer = setTimeout(() => {
        setShowHighlight(true);
      }, currentStep.highlightDelay);
      return () => clearTimeout(timer);
    } else {
      // No delay, show highlight immediately
      setShowHighlight(true);
    }
  }, [tutorialActive, currentTutorialStep, tutorialSteps]);

  // Don't render during SSR or when tutorial is inactive
  if (!mounted || !tutorialActive || currentTutorialStep >= tutorialSteps.length) {
    return null;
  }

  const currentStep = tutorialSteps[currentTutorialStep];

  const handleContinue = () => {
    completeCurrentStep();
    nextTutorialStep();
  };

  return createPortal(
    <>
      {/* Click-to-continue overlay (when waitForClick is true) */}
      {currentStep.waitForClick && (
        <div
          role="button"
          tabIndex={0}
          onClick={handleContinue}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleContinue();
            }
          }}
          aria-label={tc("Click to continue tutorial")}
          className="fixed inset-0 cursor-pointer"
          style={{ zIndex: 192 }}
        />
      )}

      {/* Element highlight (if specified and delay has passed) */}
      {currentStep.highlightSelector && showHighlight && (
        <ElementHighlight selector={currentStep.highlightSelector} />
      )}

      {/* Tutorial message - hide if current step is completed */}
      {!currentStep.completed && (
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 193 }}>
          <TutorialMessage
            message={tc(currentStep.message)}
            position={currentStep.position}
            waitForClick={currentStep.waitForClick}
            links={currentStep.links}
          />
        </div>
      )}

      {/* Skip tutorial button */}
      <button
        onClick={skipTutorial}
        className="fixed top-20 right-4 px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors pointer-events-auto"
        style={{ zIndex: 194 }}
      >{tc("Skip tutorial")}</button>
    </>,
    document.body
  );
}
