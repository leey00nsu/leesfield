import {fireEvent, screen} from "@testing-library/react";
import {renderWithIntl} from "@/test-utils/intl";
import {VariantImage} from "./variant-image";
it("uses full-resolution display with bounded fallback, keeps animation original, and resets for another asset", () => {
 const asset = {url: "https://example.com/original.gif", imageVariants: {version: 1, isAnimated: false, display: {url: "https://example.com/display.webp", mimeType: "image/webp", bytes: 30, width: 100, height: 100}, thumbnail: null}};
 const {rerender} = renderWithIntl(<VariantImage asset={asset} alt="preview" />);
 expect(screen.getByRole("img")).toHaveAttribute("src", asset.imageVariants.display.url);
 fireEvent.error(screen.getByRole("img"));
 expect(screen.getByRole("img")).toHaveAttribute("src", asset.url);
 rerender(<VariantImage asset={{...asset, imageVariants: {...asset.imageVariants, isAnimated: true}}} alt="preview" />);
 expect(screen.getByRole("img")).toHaveAttribute("src", asset.url);
 rerender(<VariantImage asset={{url: "https://example.com/legacy.png"}} alt="preview" />);
 expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/legacy.png");
});

it("keeps loading through fallback, ends at success/final error, and retries the original candidates", () => {
 const loaded = vi.fn(), failed = vi.fn();
 const variant = (url: string) => ({url:"https://example.com"+url,mimeType:"image/webp",bytes:1,width:100,height:100});
 const asset={url:"/original.png",imageVariants:{version:1,isAnimated:false,thumbnail:variant("/thumb.webp"),display:variant("/display.webp")}};
 const view=renderWithIntl(<VariantImage asset={asset} purpose="list" alt="preview" retry onLoad={loaded} onError={failed}/>);
 expect(screen.getByRole("status",{name:"미디어를 불러오는 중"})).toBeInTheDocument();
 fireEvent.error(screen.getByRole("img"));
 expect(screen.getByRole("img")).toHaveAttribute("src","https://example.com/display.webp");
 expect(failed).not.toHaveBeenCalled();
 expect(screen.getByRole("status",{name:"미디어를 불러오는 중"})).toBeInTheDocument();
 fireEvent.load(screen.getByRole("img"));
 expect(loaded).toHaveBeenCalledOnce();expect(screen.queryByRole("status",{name:"미디어를 불러오는 중"})).not.toBeInTheDocument();
 view.rerender(<VariantImage asset={{url:"/broken.png"}} alt="preview" retry onError={failed}/>);
 expect(screen.getByRole("status",{name:"미디어를 불러오는 중"})).toBeInTheDocument();
 fireEvent.error(screen.getByRole("img"));
 expect(failed).toHaveBeenCalledOnce();expect(screen.queryByRole("status",{name:"미디어를 불러오는 중"})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"다시 시도"}));
 expect(screen.getByRole("status",{name:"미디어를 불러오는 중"})).toBeInTheDocument();
 expect(screen.getByRole("img")).toHaveAttribute("src","/broken.png");
});
it("recognizes a hydrated cached image and forwards its actual image ref", () => {
 let element: HTMLImageElement | null=null;
 renderWithIntl(<VariantImage asset={{url:"/cached.png"}} alt="cached" ref={image=>{
   element=image;if(image)Object.defineProperties(image,{complete:{configurable:true,value:true},naturalWidth:{configurable:true,value:120}});
 }}/>);
 expect(element).toBe(screen.getByRole("img"));
 expect(screen.queryByRole("status",{name:"미디어를 불러오는 중"})).not.toBeInTheDocument();
});
