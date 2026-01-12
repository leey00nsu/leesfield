import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Film,
  Image as ImageIcon,
  Info,
  KeyRound,
  Lock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { DashboardPageHeader } from "@/shared/ui/dashboard-page-header";
import { Button } from "@/shared/ui/button";

const navSections = [
  {
    title: "General",
    items: [
      { id: "introduction", label: "Introduction", icon: Info, active: true },
      { id: "authentication", label: "Authentication", icon: Lock },
      { id: "errors", label: "Errors", icon: AlertTriangle },
    ],
  },
  {
    title: "Endpoints",
    items: [
      { id: "images", label: "Images", icon: ImageIcon },
      { id: "videos", label: "Videos", icon: Film },
      { id: "models", label: "Models", icon: Boxes },
    ],
  },
];

const highlightCards = [
  {
    title: "Low Latency",
    description: "Optimized inference pipelines for rapid generation.",
    icon: Zap,
  },
  {
    title: "Secure",
    description: "Scoped API keys with strict validation and rotation tools.",
    icon: ShieldCheck,
  },
  {
    title: "RESTful",
    description: "Predictable endpoints and response shapes for fast integration.",
    icon: BookOpen,
  },
];

const errorCards = [
  {
    status: "400",
    title: "Invalid request",
    description: "Payload validation failed. Fix fields and retry.",
  },
  {
    status: "401",
    title: "Unauthorized",
    description: "Missing API key header or invalid credentials.",
  },
  {
    status: "403",
    title: "Forbidden",
    description: "Key is revoked or does not have access to the resource.",
  },
  {
    status: "500",
    title: "Server error",
    description: "Unexpected error. Capture the request id and contact support.",
  },
];

const imageParameters = [
  {
    name: "prompt",
    required: true,
    type: "string",
    description: "Text description of the image you want to generate.",
  },
  {
    name: "model",
    required: false,
    type: "string",
    description: "Model ID. Defaults to the recommended image model.",
  },
  {
    name: "seed",
    required: false,
    type: "integer",
    description: "Random seed for reproducibility.",
  },
  {
    name: "width",
    required: false,
    type: "integer",
    description: "Output width in pixels (default 1024).",
  },
  {
    name: "height",
    required: false,
    type: "integer",
    description: "Output height in pixels (default 1024).",
  },
];

const imageRequestSnippet = `curl -X POST https://api.leesfield.ai/v1/images \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "A futuristic city with neon lights",
    "model": "stable-diffusion-xl",
    "seed": 42,
    "width": 1024,
    "height": 1024
  }'`;

const imageResponseSnippet = `{
  "requestId": "img_01HD8X...",
  "status": "processing",
  "progress": 42
}`;

const errorResponseSnippet = `{
  "message": "INVALID_REQUEST",
  "errors": {
    "prompt": ["Required"]
  }
}`;

export function ApiDocsWidget() {
  return (
    <div className="flex flex-col gap-8 pb-20">
      <DashboardPageHeader
        title={
          <>
            <span className="text-white">API</span>{" "}
            <span className="text-primary">Documentation</span>
          </>
        }
        subtitle="REST API REFERENCE"
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-6 sm:px-10 lg:flex-row">
        <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-white/10 pr-6">
          <div className="sticky top-28 flex flex-col gap-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 font-mono">
              <span className="h-2 w-2 rounded-full bg-primary" />
              API Reference v1
            </div>
            <nav className="flex flex-col gap-8">
              {navSections.map((section) => (
                <div key={section.title} className="flex flex-col gap-2">
                  <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-white">
                    {section.title}
                  </h3>
                  <div className="flex flex-col gap-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <a
                          key={item.id}
                          href={`#${item.id}`}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            item.active
                              ? "border border-primary/10 bg-primary/10 text-primary"
                              : "text-gray-400 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex w-full flex-col gap-16 pb-24">
            <section
              id="introduction"
              className="flex flex-col gap-6 scroll-mt-32"
            >
              <div>
                <h2 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
                  Welcome to <span className="text-primary">API Docs</span>
                </h2>
                <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-3xl">
                  Integrate lee&#39;s field into your products with REST endpoints
                  for image, video, and model discovery. Everything is protected
                  by API keys and documented directly from our request and
                  response types.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {highlightCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      className="rounded-2xl border border-white/5 bg-surface-dark p-5 transition-colors hover:border-primary/30"
                    >
                      <div className="mb-3 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-base font-bold text-white">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-sm text-gray-500">
                        {card.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-white/10 to-transparent" />

            <section
              id="authentication"
              className="flex flex-col gap-8 scroll-mt-32"
            >
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Authentication
                </h2>
                <p className="text-gray-400 leading-relaxed">
                  Authenticate every request with your API key. You can manage
                  keys in the{"
                  " "}
                  <Link
                    href="/api-key"
                    className="text-primary hover:underline"
                  >
                    API Keys
                  </Link>{" "}
                  dashboard.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
                    Header Authentication
                  </span>
                  <Button
                    asChild
                    variant="outline"
                    className="h-8 rounded-full border-white/10 bg-surface-lighter px-3 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-white/10"
                  >
                    <Link href="/api-key">View API Keys</Link>
                  </Button>
                </div>
                <div className="p-6">
                  <p className="text-sm text-gray-400">
                    Include your API key in the{"
                    " "}
                    <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                      X-API-Key
                    </code>{" "}
                    header for every request.
                  </p>
                  <div className="mt-4 rounded-lg border border-white/5 bg-black/50 p-4 font-mono text-sm text-gray-300">
                    <span className="text-accent-purple">curl</span> https://api.leesfield.ai/v1/models \
                    <div className="pl-4 mt-1">
                      -H <span className="text-green-400">"X-API-Key: lf_live_..."</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                    <p className="text-xs text-gray-400">
                      Keep your keys secure. Never expose secret API keys in
                      client-side code or public repositories.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-white/10 to-transparent" />

            <section id="errors" className="flex flex-col gap-8 scroll-mt-32">
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  Errors
                </h2>
                <p className="text-gray-400 leading-relaxed max-w-2xl">
                  Every error response follows a consistent structure so you can
                  reliably surface issues to users and retry when appropriate.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {errorCards.map((card) => (
                  <div
                    key={card.status}
                    className="rounded-2xl border border-white/5 bg-surface-dark p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-300">
                        {card.status}
                      </span>
                      <h3 className="text-sm font-bold text-white">
                        {card.title}
                      </h3>
                    </div>
                    <p className="mt-3 text-sm text-gray-400">
                      {card.description}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-white/5 bg-black/60 p-6">
                <p className="text-xs font-mono uppercase tracking-wider text-gray-500">
                  Example error payload
                </p>
                <pre className="mt-3 overflow-x-auto text-sm text-gray-300">
                  {errorResponseSnippet}
                </pre>
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-white/10 to-transparent" />

            <section id="images" className="flex flex-col gap-8 scroll-mt-32">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Images
                </h2>
                <span className="rounded border border-white/5 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                  Version 1
                </span>
              </div>

              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_10px_rgba(212,240,50,0.3)]">
                      POST
                    </span>
                    <code className="font-mono text-lg text-white">
                      /api/external/image-generation
                    </code>
                  </div>
                  <p className="text-gray-400 leading-relaxed max-w-3xl">
                    Create a new image generation request. Configure the prompt,
                    model, and output dimensions in the request body.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                  <div className="border-b border-white/5 bg-white/5 px-6 py-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
                      Body Parameters
                    </span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {imageParameters.map((param) => (
                      <div
                        key={param.name}
                        className="grid grid-cols-1 gap-4 p-6 md:grid-cols-[200px_1fr]"
                      >
                        <div className="flex flex-col gap-1">
                          <code className="font-mono font-bold text-primary">
                            {param.name}
                          </code>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              param.required
                                ? "text-destructive"
                                : "text-gray-500"
                            }`}
                          >
                            {param.required ? "Required" : "Optional"}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-gray-300">
                            {param.type}
                          </span>
                          <p className="text-sm text-gray-400">
                            {param.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/5 bg-black shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/5 bg-black px-4 py-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                      BASH Request
                    </span>
                  </div>
                  <pre className="overflow-x-auto p-6 text-sm text-gray-300">
                    {imageRequestSnippet}
                  </pre>
                </div>

                <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/5 bg-surface-lighter px-4 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Example Response
                    </span>
                    <span className="text-[10px] font-mono text-primary">
                      200 OK
                    </span>
                  </div>
                  <pre className="overflow-x-auto p-6 text-sm text-gray-300">
                    {imageResponseSnippet}
                  </pre>
                </div>
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-white/10 to-transparent" />

            <section id="videos" className="flex flex-col gap-8 scroll-mt-32">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Videos
                </h2>
                <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-black">
                  Beta
                </span>
              </div>
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/5 bg-surface-dark p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-lighter text-gray-500">
                  <Film className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Video Generation API
                </h3>
                <p className="max-w-md text-gray-400">
                  Video generation endpoints are currently in private beta. If
                  you need access for your application, reach out to our team.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-white/10 bg-white/5 px-6 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10"
                >
                  Request Access
                </Button>
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-white/10 to-transparent" />

            <section id="models" className="flex flex-col gap-8 scroll-mt-32">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Models
                </h2>
                <span className="rounded border border-white/5 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                  Version 1
                </span>
              </div>
              <div className="rounded-2xl border border-white/5 bg-surface-dark p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                    GET
                  </span>
                  <code className="font-mono text-lg text-white">
                    /api/external/models
                  </code>
                </div>
                <p className="mt-4 text-gray-400">
                  Retrieve the catalog of available generation models with
                  metadata such as type, version, and default settings.
                </p>
                <div className="mt-6 rounded-xl border border-white/5 bg-black/60 p-4">
                  <pre className="overflow-x-auto text-sm text-gray-300">
                    {`{
  "items": [
    { "id": "image-core", "type": "image", "label": "Image Core" }
  ]
}`}
                  </pre>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
