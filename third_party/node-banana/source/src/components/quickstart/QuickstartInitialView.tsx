"use client";

import { CanvasBrandLogo } from "../../leesfield/branding";
import { useCanvasTranslation } from "../../leesfield/localization";

interface QuickstartInitialViewProps {
  onNewProject: () => void;
  onSelectTemplates: () => void;
  onStartTutorial: () => void;
  onSelectLoad: () => void;
}

export function QuickstartInitialView({
  onNewProject,
  onSelectTemplates,
  onStartTutorial,
  onSelectLoad,
}: QuickstartInitialViewProps) {
  const tc = useCanvasTranslation();
  return (
    <div className="p-8">
      <div className="flex gap-10 max-sm:flex-col max-sm:gap-4">
        {/* Left column - Info */}
        <div className="flex-1 flex flex-col">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <h1><CanvasBrandLogo /></h1>
            </div>
          </div>

          <p className="text-sm text-neutral-400 leading-relaxed mb-6">{tc("A node based workflow editor for generative AI pipelines. Connect nodes to build pipelines that transform and generate images, video and audio.")}</p>

        </div>

        {/* Right column - Options */}
        <div className="flex-1 flex flex-col gap-2 justify-end">
          <OptionButton
            onClick={onNewProject}
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            }
            title={tc("New space")}
            description={tc("Start an empty Space")}
          />

          <OptionButton
            onClick={onSelectLoad}
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
              />
            }
            title={tc("Spaces")}
            description={tc("Browse your Spaces")}
          />

          <OptionButton
            onClick={onSelectTemplates}
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
              />
            }
            title={tc("Templates")}
            description={tc("Pre-built workflows")}
          />

          <OptionButton
            onClick={onStartTutorial}
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            }
            title={tc("Tutorial")}
            description={tc("Learn the basics in a new Space")}
          />

        </div>
      </div>
    </div>
  );
}

function OptionButton({
  onClick,
  icon,
  title,
  description,
  badge,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left p-4 rounded-lg border border-neutral-700/50 hover:border-neutral-600 hover:bg-neutral-800/40 transition-all duration-150"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-neutral-700/50 flex items-center justify-center flex-shrink-0 group-hover:bg-neutral-700 transition-colors">
          <svg
            className="w-4 h-4 text-neutral-400 group-hover:text-neutral-300 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            {icon}
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-neutral-200 group-hover:text-neutral-100 transition-colors">
              {title}
            </h3>
            {badge && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-blue-500/20 text-blue-400">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500">{description}</p>
        </div>
      </div>
    </button>
  );
}
