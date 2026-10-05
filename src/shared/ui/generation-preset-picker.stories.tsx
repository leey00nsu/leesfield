import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { builtinPromptPresets } from "@/shared/prompt-presets/builtin-prompt-presets";
import { GenerationPresetPicker } from "./generation-preset-picker";

const presets = builtinPromptPresets.map(p => ({ ...p, builtinKey: p.key, builtinRevision: p.revision, defaultPrompt: p.prompt, isActive: true, isModified: false }));
const meta = {
  title: "Project Design/Generation/PresetPicker", component: GenerationPresetPicker,
  args: { items: presets, selected: null, onSelect: () => {}, onRetry: () => {}, onClear: () => {}, onReapply: () => {}, onRestore: () => {} },
  decorators: [(Story) => <div className="flex min-h-screen items-end p-8"><Story /></div>],
} satisfies Meta<typeof GenerationPresetPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Loading: Story = { args: { loading: true } };
export const Empty: Story = { args: { items: [] } };
export const Error: Story = { args: { error: true } };
export const Modified: Story = { args: { selected: presets[0], modified: true } };
export const Space: Story = { args: { appearance: "space", selected: presets[0] } };
export const Disabled: Story = { args: { disabled: true } };
