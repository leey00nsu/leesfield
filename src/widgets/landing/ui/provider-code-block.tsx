"use client";

import type { BundledLanguage } from "./kibo-code-block";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
} from "./kibo-code-block";

export const ProviderCodeBlock = ({ source }: { source: string }) => {
  const code = [
    { language: "typescript", filename: "image-generation.ts", code: source },
  ];
  return (
    <div data-provider-code-preview="" className="w-full max-w-sm [&_pre]:!py-3 [&_code]:!text-[10px] [&_code]:!leading-[18px] sm:[&_code]:!text-[11px] [&_.line]:!px-3 [&_.line]:!whitespace-pre-wrap [&_.line]:[overflow-wrap:anywhere]">
      <CodeBlock data={code} defaultValue="typescript">
        <CodeBlockHeader className="justify-between">
          <CodeBlockFiles>
            {(item) => (
              <CodeBlockFilename key={item.language} value={item.language}>
                {item.filename}
              </CodeBlockFilename>
            )}
          </CodeBlockFiles>
        </CodeBlockHeader>
        <CodeBlockBody>
          {(item) => (
            <CodeBlockItem key={item.language} value={item.language}>
              <CodeBlockContent language={item.language as BundledLanguage}>
                {item.code}
              </CodeBlockContent>
            </CodeBlockItem>
          )}
        </CodeBlockBody>
      </CodeBlock>
    </div>
  );
};
