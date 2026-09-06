import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {describe,it,expect} from "vitest";
import manifest from "./source-manifest.json";
describe("Copy Singer pinned source",()=>{for(const file of manifest.files){it(file.target,()=>{const adapted=readFileSync(resolve(file.target),"utf8");expect(createHash("sha256").update(adapted).digest("hex")).toBe(file.adaptedSha256);const original=adapted.replace('import { CloseLabel } from "@/shared/ui/close-label";\n', "").replaceAll("<CloseLabel />", "닫기").replaceAll("@/shared/lib/utils","@/shared/lib/cn").replace(/@\/shared\/ui\/brand\/([a-z-]+)\/\1/g,"@/shared/ui/$1");expect(createHash("sha256").update(original).digest("hex")).toBe(file.sourceSha256);});}});
