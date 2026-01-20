import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Film,
  Image as ImageIcon,
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
  { id: "images", icon: ImageIcon },
  { id: "videos", icon: Film },
  { id: "models", icon: Boxes },
];

export const tagIdMap: Record<string, string> = {
  Images: "images",
  Videos: "videos",
  Models: "models",
};

export function getEndpointIcon(section: ApiSection): LucideIcon {
  const key = section.id.toLowerCase();
  if (key.includes("image")) return ImageIcon;
  if (key.includes("video")) return Film;
  if (key.includes("model")) return Boxes;
  return BookOpen;
}
