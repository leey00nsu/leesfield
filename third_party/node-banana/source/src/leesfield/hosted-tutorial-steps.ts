export interface TutorialLink {
  text: string;
  url: string;
}

export interface TutorialStep {
  id: string;
  message: string;
  highlightSelector?: string | string[]; // Single selector or array of selectors
  highlightDelay?: number; // Delay in ms before showing highlight
  advanceDelay?: number; // Delay in ms before advancing to next step after action completes (default: 1000)
  requiredAction?:
    | "add-image-node"
    | "add-output-node"
    | "connect-nodes"
    | "run-workflow"
    | "show-connection-menu"
    | "add-nanoBanana-from-menu"
    | "add-prompt-node"
    | "connect-prompt-node";
  position?: "left" | "right" | "center" | "top-center";
  waitForClick?: boolean;
  links?: TutorialLink[];
  completed: boolean;
}

export const initialTutorialSteps: TutorialStep[] = [
  {
    id: "welcome",
    message: "Let's go over the basics.",
    completed: false,
  },
  {
    id: "add-image",
    message: "Click the Image button to add an image node.",
    highlightSelector: '[data-tutorial="image-button"]',
    requiredAction: "add-image-node",
    completed: false,
  },
  {
    id: "explain-node",
    message: "This is a node. Each node has a specific function.\n\nThis node adds images.",
    position: "top-center",
    waitForClick: true,
    completed: false,
  },
  {
    id: "explain-node-inputs",
    message: "Inputs always go in on the left side of the node.",
    highlightSelector: '[data-tutorial="node-input-handle"]',
    highlightDelay: 1000,
    position: "left",
    waitForClick: true,
    completed: false,
  },
  {
    id: "explain-node-outputs",
    message: "Outputs always come from the right side of the node.",
    highlightSelector: '[data-tutorial="node-output-handle"]',
    highlightDelay: 1000,
    position: "right",
    waitForClick: true,
    completed: false,
  },
  {
    id: "drag-and-drop",
    message: "Now drag from the output handle and drop into empty space.",
    highlightSelector: '[data-tutorial="node-output-handle"]',
    position: "right",
    requiredAction: "show-connection-menu",
    advanceDelay: 0,
    completed: false,
  },
  {
    id: "select-generate-image",
    message: "This menu will show all available connections for the node.\n\nSelect 'Generate Image' to add an AI image generation node.",
    highlightSelector: '[data-tutorial="generate-image-option"]',
    position: "top-center",
    requiredAction: "add-nanoBanana-from-menu",
    completed: false,
  },
  {
    id: "add-prompt-node",
    message: "Click the Prompt button to add a prompt node.",
    highlightSelector: '[data-tutorial="prompt-button"]',
    position: "top-center",
    requiredAction: "add-prompt-node",
    completed: false,
  },
  {
    id: "connect-prompt-to-generate",
    message: "Drag from the Prompt's output handle to the Generate Image's input handle.",
    highlightSelector: ['[data-tutorial="prompt-output-handle"]', '[data-tutorial="generate-text-input-handle"]'],
    position: "left",
    requiredAction: "connect-prompt-node",
    completed: false,
  },
  {
    id: "populate-content",
    message: "Let me just add some stuff here 🎨",
    position: "top-center",
    completed: false,
  },
  {
    id: "explain-generate-node",
    message: "This is the Generate Image node. It uses AI to create or modify images based on your prompt and reference image.",
    highlightSelector: '[data-tutorial="generate-image-node"]',
    position: "top-center",
    waitForClick: true,
    completed: false,
  },
  {
    id: "explain-run-button",
    message: "Clicking this Run button will run your workflow. You can also press Cmd+Enter (Ctrl+Enter on Windows).",
    highlightSelector: '[data-tutorial="floating-run-button"]',
    position: "top-center",
    waitForClick: true,
    completed: false,
  },
  {
    id: "explain-run-options",
    message: "You can also click the dropdown to run from a specific node, or run only selected nodes.",
    highlightSelector: '[data-tutorial="floating-run-dropdown"]',
    position: "top-center",
    waitForClick: true,
    completed: false,
  },
  {
    id: "run-workflow",
    message: "Now let's run your workflow! Click the Run button to generate your image.",
    highlightSelector: '[data-tutorial="floating-run-button"]',
    position: "top-center",
    requiredAction: "run-workflow",
    completed: false,
  },
  {
    id: "demonstrate-downstream",
    message: "Now let me show you the possibilities... 🎬✨",
    position: "top-center",
    completed: false,
  },
  {
    id: "demonstrate-complete",
    message: "Connect more nodes downstream to build generative pipelines, or just use it as an infinite creative canvas.",
    position: "top-center",
    waitForClick: true,
    completed: false,
  },
  {
    id: "save-project",
    message: "Save your project to keep all your work and generations locally.",
    highlightSelector: '[data-tutorial="save-button"]',
    position: "top-center",
    waitForClick: true,
    completed: false,
  },
  {
    id: "resources",
    message: "Check out the resources below for help and inspiration:",
    position: "left",
    waitForClick: true,
    links: [
      { text: "Join our Discord community", url: "https://discord.gg/node-banana" },
    ],
    completed: false,
  },
  {
    id: "complete",
    message: "You're all set! Happy creating.",
    position: "top-center",
    completed: false,
  },
];
export const hostedTutorialSteps = initialTutorialSteps.filter((step) => !["populate-content", "explain-run-options", "demonstrate-downstream", "resources"].includes(step.id)).map((step) => {
  if (step.id === "explain-run-button") return { ...step, message: "Choose a model, upload your image and write a prompt. Run the Generate Image node when you are ready.", highlightSelector: '[data-canvas-action="run"]' };
  if (step.id === "run-workflow") return { ...step, message: "Run your Generate Image node to create an image. You can skip the tutorial at any time.", highlightSelector: '[data-canvas-action="run"]' };
  if (step.id === "save-project") return { ...step, message: "Your Space saves automatically. Use Save to check that the latest changes reached the server." };
  return step;
});
