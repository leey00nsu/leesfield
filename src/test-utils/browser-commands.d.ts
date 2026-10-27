import "vitest/browser";
declare module "vitest/browser" {
  interface BrowserCommands {
    cancelFileChooser(selector: string): Promise<void>;
    nativeDrag(selector: string, dx: number, dy: number, button?: "left" | "middle"): Promise<void>;
    nativeConnect(source: string, target: string): Promise<void>;
  }
}
