import {
  AlertTriangle,
  BookOpen,
  Sparkles,
  Boxes,
  Info,
  Lock,
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
  { id: "authentication", icon: Lock },
  { id: "errors", icon: AlertTriangle },
];

export const fallbackEndpointItems: ApiDocsNavDefinition[] = [
  { id: "generations", icon: Sparkles },
  { id: "models", icon: Boxes },
];
export const tagIdMap: Record<string, string> = {
  Generations: "generations",
  Models: "models",
};
export function getEndpointIcon(section: ApiSection): LucideIcon {
  return section.id === "generations"
    ? Sparkles
    : section.id === "models"
      ? Boxes
      : BookOpen;
}
