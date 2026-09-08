import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { BundledLanguage, CodeOptionsMultipleThemes } from "shiki";
import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";

const highlighter = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark-default.mjs")],
  langs: [
    import("shiki/langs/typescript.mjs"), import("shiki/langs/javascript.mjs"),
    import("shiki/langs/json.mjs"), import("shiki/langs/bash.mjs"),
    import("shiki/langs/python.mjs"), import("shiki/langs/yaml.mjs"),
    import("shiki/langs/css.mjs"), import("shiki/langs/tsx.mjs"),
  ],
});
export async function highlightCode(html: string, language?: BundledLanguage, themes?: CodeOptionsMultipleThemes["themes"]) {
  const engine = await highlighter;
  const requested = language ?? "typescript";
  const lang = engine.getLoadedLanguages().includes(requested) ? requested : "text";
  return engine.codeToHtml(html, {
    lang, themes: themes ?? { light: "github-light", dark: "github-dark-default" },
    transformers: [
      transformerNotationDiff({ matchAlgorithm: "v3" }),
      transformerNotationHighlight({ matchAlgorithm: "v3" }),
      transformerNotationWordHighlight({ matchAlgorithm: "v3" }),
      transformerNotationFocus({ matchAlgorithm: "v3" }),
      transformerNotationErrorLevel({ matchAlgorithm: "v3" }),
    ],
  });
}
