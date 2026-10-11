# Cinema composition preview sources

The eight photographs are composition examples based on one user-provided reference image (2026-10-11). They do not preview aperture, camera, lens or style changes. Auto/off and image failures use full.webp. Actual generation prompts and settings remain independent of these preview assets.

Reference: cinema/reference-main.webp, lossless conversion of the supplied 1024×1024 PNG. Original SHA-256: 0ee8b214b8284417ec5c314c79b15ac53c2b5eab284f4243234d491f5fa3bf1e. User supplied for this project; no public-domain/CC0 license is claimed.

Production: three assets from built-in imagegen reference edits (the wide shot is reframed from the same extreme-wide image), and five Viggle/Qwen-Image-2.1-viggle-turbo v0.3 6-step reference edits. All references derive directly from the same original, including cropped shot guides. The five close shot guides were cropped before generation to control framing; this is asset preparation, not proof of the production prompt model's framing accuracy. imagegen does not expose a model name or seed. Prompts that requested a different shot size are assigned here by the actual visible result; requested framing is not reported as successful automatically.

All assets: 1376×768 WebP quality90; no added blur or color correction. Wide.webp uses a documented post-generation crop (left310/top210/1088×608) of the extreme-wide image to preserve identical expanded surroundings; other assets are resized without post-generation crop. Wide frames synthesize surroundings beyond the supplied photograph; facade/vegetation/furniture details and fine facial details can differ. Extreme wide remains approximately 22% subject height, slightly larger than the 10–20% prompt target. Aperture is deliberately not evaluated or represented.

Full requested prompt, reference/crop chain, actual provider parameters where available, output hashes and transformations: cinema/preview-manifest.json. No runtime API calls or external image hotlinks.

| Composition | File | Tool |
|---|---|---|
| 초원경 | cinema/previews/extreme-wide.webp | built-in imagegen |
| 원경 | cinema/previews/wide.webp | built-in imagegen |
| 전신 샷 | cinema/previews/full.webp | built-in imagegen |
| 중원경 | cinema/previews/medium-wide.webp | Qwen reference edit |
| 중간 샷 | cinema/previews/medium.webp | Qwen reference edit |
| 미디엄 클로즈업 | cinema/previews/medium-close-up.webp | Qwen reference edit |
| 클로즈업 | cinema/previews/close-up.webp | Qwen reference edit |
| 익스트림 클로즈업 | cinema/previews/extreme-close-up.webp | Qwen reference edit |
