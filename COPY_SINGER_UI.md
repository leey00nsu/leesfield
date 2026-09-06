# Copy Singer UI reuse

Source: https://github.com/leey00nsu/copy-singer/tree/eb164d718d66b2ce3e177fc03727ae60ec0add3d

The domain-independent components in src/shared/ui/brand preserve the pinned source. source-manifest.json records source and normalized file hashes. Only cn and direct UI import paths are normalized. Theme is supplied by Leesfield; component variants and geometry remain upstream.

Existing call sites use compatibility adapters outside brand. Spaces uses preserved shared/ui/legacy until its planned migration; remove this copy when Spaces moves to the same brand components. Do not extend legacy. No Copy Singer domain code is imported and no shared package is published.

## Integration checks

The source set includes the original chart with Recharts 3.8.0, matching upstream. Source files remain unchanged after import normalization. The generation shell forwards vertical orientation directly to Base UI Root and supplies the orientation data attributes consumed by the upstream tab classes; the original Tabs wrapper omits forwarding orientation. Existing select JSX options are also supplied as items so the selected label renders before the popup mounts. Dialog size aliases set responsive max-width to preserve domain editor layouts. These adaptations are outside the pinned source.

Storybook Brand/Copy Singer parity compares the source and compatibility adapters under the same dark blue theme. The general UI uses Pretendard; the Spaces route temporarily loads its previous heading font and legacy controls until the planned Spaces migration.

## Landing composition: Aceternity UI
- Source: https://ui.aceternity.com/registry/features-section-demo-2.json (2026-09-06), Manu Arora. SHA256: 209767bb9bc89e94d29f89c627d1d5e71b5e661dbca7fb29230dd11dda4a5e60
- Adopted Feature block in widgets/landing/ui/aceternity-feature.tsx; removed demo data, retained bordered grid/hover treatment, mapped theme and lucide icons, added semantic headings/reduced motion. No additional dependency.
- License: Aceternity License, linked from site Licence page. End product use and modification permitted; source/component redistribution restricted. Keep this landing-specific component outside future distributable brand UI package.
- Aside CLI verified Aceternity free features preview and code, 21st.dev catalogue, React Bits catalogue. React Bits FadeContent considered but not adopted: GSAP dependency and overlap with existing reveal. Its MIT + Commons Clause also restricts component redistribution.

## T11 목록/필터 통합
ResourceRowButton 및 resourceRowInteractiveClassName을 동일 원본 SHA에서 추가 이식한다. 총 23 파일. 모델 행의 큰 아이콘/기본 모델 외곽 강조를 제거하고 원본 stretched action 및 badge를 적용한다. 검색은 원본 Input+장식 아이콘 구성으로 정렬하고 모델 필터는 라벨/모바일 Sheet 구성을 사용한다. 도메인 필터 조건은 Leesfield 기준이다.

## T13 landing refinements (2026-09-06)

- Copy Singer `src/_pages/home/ui/landing-hero.tsx` at the pinned revision supplies the announcement pill anatomy and description entryMotion (14px, 0.64s, ease 0.22/1/0.36/1). Copy is Leesfield-specific. All sections reuse the unchanged RevealContent; BentoGrid and BentoGridItem remain unchanged.
- Aceternity Layout Text Flip: https://ui.aceternity.com/components/layout-text-flip ; registry https://ui.aceternity.com/registry/layout-text-flip.json . Border/background/ring removed as requested, renderWord logo slot added, hook dependencies and reduced-motion added.
- Aceternity Terminal: https://ui.aceternity.com/components/terminal ; registry https://ui.aceternity.com/registry/terminal.json . Bash tokenizer, viewport trigger and typing phase machine retained; all audio code removed, reduced-motion renders complete static commands, import path and overflow adapted. One scoped eslint exception preserves the upstream command-commit effect. No new dependency. Both components remain landing-only under the Aceternity license already documented above; not part of a redistributable brand package. The earlier hover feature block is replaced by the Copy Singer Bento component.
- Model names and downloaded official organization avatars: `src/widgets/landing/ui/landing-models.json` records each source and verification date. Local/open-weight family references: Wan 2.2, LTX-2.5, FLUX.2 klein, Z-Image, Qwen-Image-2512. MiniMax Speech 2.8 is an API speech model, not described as local or open-weight. These are editorial examples, not a claim that every deployment catalog contains them.
- The landing canvas now uses the same @xyflow/react engine directly with four compact local presenter nodes and three edges. Full NodeBanana editor chrome and service hooks are not mounted. Actual Spaces editor remains unchanged.

Original registry source SHA-256: Layout Text Flip `7eb45448a2815b4f86492cf6192ff5a9ae4c15cd995b9a70199b7f40ba5393d4`; Terminal `42e922c2f5841406bfb0eeb3db47b6f70af3e4e029d01f99de7f9d32c736d7b2`.

## T14 integration (2026-09-06)

Layout Text Flip now displays logos only, reserves a fixed em-sized slot and leaves blur overflow visible. LTX uses CSS inversion for dark-background contrast; Wan and Z-Image share the Wan avatar URL. Terminal keeps the Aceternity frame and typing phases but renders JavaScript tokens with no shell prompt.

Landing announcement, Unplug, CTA and shared GenerationModelSection/GenerationSettingsPopover now compose the editable preview. Authenticated users receive the existing runtime catalog; guests see editorial examples without fetching the protected API. Prompt/model and image dimensions/count/steps pass to generation; image ranges are clamped by the real model. Attached image data travels in sessionStorage under an opaque query ID and is applied only to a compatible model, never submitted from the landing.

The four landing nodes now use the exact NodeBananaUpstreamNode and floating headers, with the existing node-studio CSS. The React Flow engine hosts them without controls, minimap or action toolbars. A fixed outer slot reserves space even while the dynamic module loads.

BentoGrid/BentoGridItem source is unchanged: fade-only entry, no child stagger, hover scaling through its public className/group contract. Interior descriptions, corner icons and preview disclaimer removed; original card footer titles remain. Shared prompt attachments precede text, char counters removed at the three form callers, and the transparent textarea removes the inherited dark fill. Hydration-safe reduced-motion subscription is landing-specific; source RevealContent is unchanged and its attribute-only hydration difference is suppressed at the callers.

## T15 logo and gradient refinement (2026-09-07)
- Audited all six original organization avatars on the charcoal surface. Retained each original contrast background; removed LTX inversion. Wan and Z-Image share the Wan asset. The fixed flex slot centers logos independently of text line boxes; interval 1800ms, transition 300ms, overflow visible.
- Copy Singer pinned source src/shared/ui/gradient-text/gradient-text.tsx supplies the reversing gradient direction/timing concept. BrandUnplug adapts it to native SVG gradient animation (1.5s each direction) using Leesfield blue stops; reduced-motion removes animation. No Copy Singer shared component source changed.
- Bento descriptions sit below original card footers via a landing wrapper. Provider preview now shows adapter/catalog/generation layers. Terminal filename label removed.

## T16 comparison and flip reliability (2026-09-07)
- FLUX cold loading reproduced the reported gap: the old logo exited before the lazily mounted Next Image decoded. All logo layers now stay mounted, eager and unoptimized for these small local assets; the timer starts after decode and skips failed assets. Aceternity entry/blur style remains, with simultaneous outgoing/incoming layers.
- Krea 2 source: https://www.krea.ai/krea-2 ; logo is the official krea-ai GitHub avatar https://avatars.githubusercontent.com/u/108735617?v=4 . Added as the fourth logo and catalog preview row, retaining Z-Image later in the flip.
- Unplug participates in word entry motion; interface text shares the blue reversing gradient timing and reduced-motion behavior.
- Spaces uses the existing upstream bodies/headers with landing-only top/bottom ports. Prompt fans out to Krea 2, GPT Image 2 and Z-Image, then Result A/B/C. Result images are supplied by the user (krea2.png, gpt image.png, zimage.png), copied without edits into public/assets/landing-comparison. No live inference or storage. The preview disables textarea pointer interception so the prompt body drags; the actual editor remains editable.

## T17 layout and loop (2026-09-07)
Landing media rail now uses the same transparent hero shell as the prompt; width-aware height reservation preserves layout across modality changes. Spaces ports are left/right, with no canvas frame and zoomOnDoubleClick=false. Aceternity Terminal retains the phase machine and restarts typing 4 seconds after completion; reduced-motion does not loop.

## T18 product previews (2026-09-07)
Bento now renders the actual ModelList, MonitoringRequestTable and MonitoringStatsChart with non-production Storybook-derived fixtures (Krea preserved in the model preview). The viewport crops and masks these unchanged product components; inert/aria-hidden prevent duplicate preview controls and API actions. A reserved 300px client-mounted viewport avoids ICU date-format hydration differences. Provider code is a line-wrapped excerpt of server/image-generation/image-generation.ts:getAdapter (hf_space/codex_bridge branches), not an invented registration API. Favicon SVG/ICO/16/32/apple assets use the current logo and its measured 10px/36px corner ratio, rasterized by browser SVG/canvas.

## T19 motion and code composition (2026-09-07)
- Official https://www.shadcnblocks.com/r/code-block/code-block-composition-1.json (SHA256 e8a3e9e8bb01bd843df5ad3bc97d39aaf5d1b90b02bff21a32dd65b5456bb8b8) and its declared https://www.kibo-ui.com/r/code-block.json (index SHA256 e2686aaf1bba4197d4a4d2f30a505ef24955bbda8cba85d5eea70074614039b2) are used in provider-code-block.tsx and kibo-code-block.tsx. Preserved CodeBlock/Header/Files/Filename/Copy/Body/Item/Content composition and highlighting. Changed demo code to the existing provider excerpt and filename, imports to AppButton/cn, trimmed unused multi-file select exports and icon map to a Lucide file icon, applied filename className, guarded missing clipboard. Added Shiki/transformers and controllable-state dependencies.
- Shadcnblocks End Product license: https://www.shadcnblocks.com/license . Keep this landing-specific composition outside any redistributed brand component package; no public source publishing performed.
- Flip outer layer now participates in entry. Jobs cycle completed/processing/pending every2.5s, pause4s at all-completed, then restart; reduced-motion stops timers. Copy action is interactive; other product mock controls remain inert.
