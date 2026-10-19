import {
  AlertTriangle,
  BookOpen,
  Sparkles,
  Boxes,
  Info,
  FileJson,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { ApiSection } from "@/features/api-docs/model/openapi-helpers";

export interface ApiDocsNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface ApiDocsNavDefinition {
  id: string;
  icon: LucideIcon;
}

export const generalNavItems: ApiDocsNavDefinition[] = [
  { id: "introduction", icon: Info },
  { id: "openapi", icon: FileJson },
  { id: "authentication", icon: Lock },
  { id: "access", icon: ShieldCheck },
  { id: "request-options", icon: SlidersHorizontal },
  { id: "errors", icon: AlertTriangle },
];

export const fallbackEndpointItems: ApiDocsNavDefinition[] = [
  { id: "generations", icon: Sparkles },
  { id: "models", icon: Boxes },
];
export const tagIdMap: Record<string, string> = {
  Generations: "generations",
  Models: "models",
  Spaces: "spaces",
  Assets: "assets",
  History: "history",
  "Prompt presets": "promptPresets",
  Monitoring: "monitoring",
  "Model administration": "modelAdministration",
};
export function getApiPermissionAnchor(permission: string) {
  return "permission-" + permission.replace(":", "-");
}

export function getEndpointIcon(section: ApiSection): LucideIcon {
  return section.id === "generations"
    ? Sparkles
    : section.id === "models"
      ? Boxes
      : BookOpen;
}
