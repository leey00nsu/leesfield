import {fireEvent, render, screen} from "@testing-library/react";
import {VariantImage} from "./variant-image";
it("uses full-resolution display with bounded fallback, keeps animation original, and resets for another asset", () => {
 const asset = {url: "https://example.com/original.gif", imageVariants: {version: 1, isAnimated: false, display: {url: "https://example.com/display.webp", mimeType: "image/webp", bytes: 30, width: 100, height: 100}, thumbnail: null}};
 const {rerender} = render(<VariantImage asset={asset} alt="preview" />);
 expect(screen.getByRole("img")).toHaveAttribute("src", asset.imageVariants.display.url);
 fireEvent.error(screen.getByRole("img"));
 expect(screen.getByRole("img")).toHaveAttribute("src", asset.url);
 rerender(<VariantImage asset={{...asset, imageVariants: {...asset.imageVariants, isAnimated: true}}} alt="preview" />);
 expect(screen.getByRole("img")).toHaveAttribute("src", asset.url);
 rerender(<VariantImage asset={{url: "https://example.com/legacy.png"}} alt="preview" />);
 expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/legacy.png");
});
