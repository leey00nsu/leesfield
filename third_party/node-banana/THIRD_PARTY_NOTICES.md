# Third-Party Notices — Node Banana

## Node Banana

- Project: Node Banana
- Version: 1.9.0
- Source: https://github.com/shrimbly/node-banana/tree/v1.9.0
- Commit: `5c0e0ae6150f29a6de819f8d6f1dedba15151f7c`
- License: MIT
- Copyright: Node Banana contributors

The complete upstream MIT license is preserved in `LICENSE` and `upstream/LICENSE`. The immutable `upstream/` directory contains the source archive identified by `UPSTREAM.json`; Leesfield changes are applied only through the ordered files in `patches/` to a generated work copy.

## Runtime dependencies

Leesfield does not install the upstream application package graph. Only the versions listed in `dependency-policy.json.runtimeDependencies` may be added to the host pnpm production graph for reachable runtime code. Host React, React DOM, React Flow, Zod and icon packages are reused instead of duplicated.

`sbom.cdx.json` is the generated production dependency inventory. `pnpm license:check` validates its source data against the license allowlist and explicit pre-existing exceptions.

## Explicit exclusions

JSZip 3.10.1 is used under its MIT license option (not GPL). Copyright
(c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso.
Its complete MIT license is distributed in the package's `LICENSE.markdown`.
The dependency policy's package-scoped dual-license exceptions select MIT;
they do not allow GPL-only dependencies.

JSZip's pako 1.0.11 dependency carries MIT AND Zlib terms. Both notices are
preserved in pako's `LICENSE` and `lib/zlib/README`; its package-scoped policy
entry accepts this verified expression without granting a general copyleft exception.

The production runtime must not include Node Banana provider SDKs/routes, browser API-key storage, local workflow/media persistence, ComfyUI, AI authoring, 3D, project-directory access, or the upstream `@imgly/background-removal` implementation. The latter is AGPL-licensed and is replaced by a Leesfield server-side, license-compatible media-operation adapter.

Sample images and template thumbnails remain only in the immutable provenance snapshot. They are not runtime entrypoints, are not copied into Leesfield public assets, and must not be included in the production bundle.
