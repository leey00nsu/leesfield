# Vendored Node Banana runtime

The immutable snapshot is in upstream/. Leesfield changes are applied in patches/series order; do not edit upstream or commit .generated output.

## Build requirements

Use Node 22, pnpm and a system patch command (GNU patch on Linux; Apple patch on macOS). Coolify/Nixpacks needs the build-time environment variable NIXPACKS_APT_PKGS=patch. pnpm install installs JavaScript dependencies but does not install this system command.

## Verify a clean build

Run pnpm install --frozen-lockfile, then pnpm vendor:node-banana:verify. Verification forces two complete rebuilds and checks reproducibility, imports and licensing. pnpm build regenerates the runtime when patch inputs change and generates Prisma Client. For platform verification, run the same preparation in a fresh Linux container, without copying .generated or node_modules from macOS.

Patches must be generated from each step's actual before/after files, with correct line ranges and context. The preparation command uses --fuzz=0: stale context must fail rather than be ignored. A normal cached build alone is not evidence that a new checkout can apply the patch chain.
