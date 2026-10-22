/*
 * Template copy and layouts adapted from Node Banana.
 * MIT License — Copyright (c) 2026 William Falloon
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { GenerationGraphEdgeDto, GenerationGraphNodeDto } from "./graph-types";
import type { SpacePresetWorkflow, SpaceQuickstartContent, SpaceQuickstartTemplate } from "./space-quickstart-types";

export const spaceQuickstartTemplates: readonly SpaceQuickstartTemplate[] = [
  {
    id: "product-shot", name: "Product Shot", description: "Place product in a new scene or environment", category: "simple", imageCount: 2,
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    prompt: "Place the product in the scene shown in the reference image.\n\nConsider:\n- Match the lighting direction and quality\n- Maintain realistic scale and perspective\n- Blend shadows naturally\n- Keep product details sharp and clear",
  },
  {
    id: "model-product", name: "Model + Product", description: "Combine model, product, and scene", category: "simple", imageCount: 3,
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    prompt: "Show the model wearing or using the product.\n\nConsider:\n- Natural pose and interaction with product\n- Consistent lighting between model and product\n- Realistic scale and proportions\n- Professional fashion/lifestyle photography style",
  },
  {
    id: "color-variations", name: "Color Variations", description: "Generate product color variants from references", category: "simple", imageCount: 3,
    icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01",
    prompt: "Generate color variations of the product using the color palette from the reference images.\n\nConsider:\n- Extract dominant colors from each reference\n- Apply colors naturally to the product\n- Maintain product shape and details\n- Keep realistic material properties",
  },
  {
    id: "background-swap", name: "Background Swap", description: "Place subject in a new background", category: "simple", imageCount: 2,
    icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    prompt: "Place the subject from the first image into the new background scene.\n\nConsider:\n- Extract subject cleanly from original\n- Match perspective and scale to new scene\n- Adjust lighting to match background\n- Blend edges naturally",
  },
  {
    id: "style-transfer", name: "Style Transfer", description: "Apply style from one image to another", category: "simple", imageCount: 2,
    icon: "M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42",
    prompt: "Apply the visual style from the first image to the content of the second image.\n\nConsider:\n- Extract color palette and mood\n- Apply texture and lighting style\n- Maintain subject recognizability\n- Create cohesive final result",
  },
  {
    id: "scene-composite", name: "Scene Composite", description: "Combine elements from multiple scenes", category: "simple", imageCount: 3,
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    prompt: "Combine elements from multiple scene images into a cohesive new scene.\n\nConsider:\n- Select complementary elements from each\n- Unify lighting direction and quality\n- Create natural depth and composition\n- Blend atmospheres seamlessly",
  },
];

/** Templates contain no asset URLs, provider state, model defaults or execution results. */
export function getSpaceQuickstartWorkflow(id: string, content: SpaceQuickstartContent = "minimal"): SpacePresetWorkflow {
  const template = spaceQuickstartTemplates.find(entry => entry.id === id);
  if (!template) throw new Error("Unknown Space template.");
  const three = template.imageCount === 3;
  const nodes: GenerationGraphNodeDto[] = Array.from({ length: template.imageCount }, (_, index) => ({
    id: `image-${index + 1}`, kind: "input.image", configVersion: 1,
    position: { x: 50, y: (three ? 50 : 100) + index * 330 }, config: { assetId: null }, selectedOutputAssetId: null,
  }));
  nodes.push(
    { id: "prompt", kind: "input.prompt", configVersion: 1, position: three ? { x: 450, y: 650 } : { x: 50, y: 760 }, config: { text: content === "empty" ? "" : template.prompt }, selectedOutputAssetId: null },
    { id: "generate", kind: "generate.image", configVersion: 1, position: { x: 450, y: 300 }, config: { prompt: "", modelKey: null, parameters: {} }, selectedOutputAssetId: null },
    { id: "output", kind: "output.single", configVersion: 1, position: { x: 850, y: 290 }, config: { mediaType: null, excludedAssetIds: [] }, selectedOutputAssetId: null },
  );
  const edges: GenerationGraphEdgeDto[] = Array.from({ length: template.imageCount }, (_, index) => ({
    id: `image-edge-${index + 1}`, sourceNodeId: `image-${index + 1}`, sourcePortId: "image", targetNodeId: "generate",
    targetPortId: index === 0 ? "primary" : "references", sortOrder: Math.max(0, index - 1), hasPause: false,
  }));
  edges.push(
    { id: "prompt-edge", sourceNodeId: "prompt", sourcePortId: "text", targetNodeId: "generate", targetPortId: "prompt", sortOrder: 0, hasPause: false },
    { id: "output-edge", sourceNodeId: "generate", sourcePortId: "image", targetNodeId: "output", targetPortId: "image", sortOrder: 0, hasPause: false },
  );
  return { id: template.id, title: template.name, schemaVersion: 3, nodes, edges, groups: [] };
}
