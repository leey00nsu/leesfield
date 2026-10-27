import { defineConfig } from "vitest/config";
import { defineBrowserCommand, playwright } from "@vitest/browser-playwright";
import path from "node:path";

export default defineConfig({
  // Browser fixtures use the same default public limits without inheriting
  // developer credentials or server environment variables.
  define: { "process.env": { NODE_ENV: "test" } },
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  optimizeDeps: { include: ["@tanstack/react-query", "sonner", "zustand/vanilla", "react-dom", "zustand", "zod",
    "@base-ui/react/slider", "@xyflow/react", "zustand/shallow", "@base-ui/react/popover", "react-compare-slider",
    "jszip", "framer-motion", "@asteasolutions/zod-to-openapi", "@base-ui/react/switch", "ajv", "ajv/dist/2020",
    "@base-ui/react/tooltip", "@base-ui/react/input", "@base-ui/react/select", "@radix-ui/react-slot", "react-hook-form",
    "@base-ui/react/menu", "@radix-ui/react-use-controllable-state", "@base-ui/react/merge-props", "@base-ui/react/use-render"] },
  test: {
    include: ["src/**/*.browser.test.tsx"],
    setupFiles: ["./src/browser-test-setup.ts"],
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: ".next/browser-components/screenshots",
      provider: playwright({ launchOptions: { channel: "chrome" }, contextOptions: { permissions: ["clipboard-read", "clipboard-write"] } }),
      commands: {
        cancelFileChooser: defineBrowserCommand(async ({ page, iframe }, selector: string) => {
          const [chosen] = await Promise.all([page.waitForEvent("filechooser"), iframe.locator(selector).getByRole("button", { name: "Upload", exact: true }).click()]);
          await chosen.setFiles([]);
        }),
        nativeDrag: defineBrowserCommand(async ({ page, iframe }, selector: string, dx: number, dy: number, button: "left" | "middle" = "left") => {
          const target = iframe.locator(selector);
          if (await target.count() !== 1) throw new Error("Native drag target must be unique: " + selector);
          const box = await target.boundingBox();
          if (!box) throw new Error("Native drag target has no bounds");
          const x = box.x + box.width / 2, y = box.y + box.height / 2;
          await page.mouse.move(x, y); await page.mouse.down({ button });
          await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up({ button });
        }),
        nativeConnect: defineBrowserCommand(async ({ page, iframe }, source: string, target: string) => {
          const a = await iframe.locator(source).boundingBox(), b = await iframe.locator(target).boundingBox();
          if (!a || !b) throw new Error("Native connection handles have no bounds");
          await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
        }),
      },
      instances: [{ browser: "chromium" }],
    },
    maxWorkers: 1,
  },
});
