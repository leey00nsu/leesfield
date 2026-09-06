declare module "gifenc" {
  export interface GIFEncoderInstance {
    writeFrame(
      indexed: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
        dispose?: number;
        transparent?: boolean;
        transparentIndex?: number;
        repeat?: number;
        first?: boolean;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GIFEncoderInstance;

  export function quantize(
    rgba: Uint8ClampedArray | Uint8Array,
    maxColors: number,
    options?: {
      format?: "rgba4444" | "rgb444" | "rgb565";
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      oneBitAlpha?: boolean | number;
    },
  ): number[][];

  export function applyPalette(
    rgba: Uint8ClampedArray | Uint8Array,
    palette: number[][],
    format?: "rgba4444" | "rgb444" | "rgb565",
  ): Uint8Array;

  export function nearestColorIndex(
    palette: number[][],
    pixel: number[],
  ): number;
}
