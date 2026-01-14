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

export const generalNavItems: ApiDocsNavItem[] = [
  { id: "introduction", label: "소개", icon: Info },
  { id: "authentication", label: "인증", icon: Lock },
  { id: "errors", label: "오류", icon: AlertTriangle },
];

export const fallbackEndpointItems: ApiDocsNavItem[] = [
  { id: "images", label: "이미지", icon: ImageIcon },
  { id: "videos", label: "비디오", icon: Film },
  { id: "models", label: "모델", icon: Boxes },
];

export const tagLabelMap: Record<string, string> = {
  Images: "이미지",
  Videos: "비디오",
  Models: "모델",
};

export function getEndpointIcon(section: ApiSection): LucideIcon {
  const key = section.id.toLowerCase();
  if (key.includes("image")) return ImageIcon;
  if (key.includes("video")) return Film;
  if (key.includes("model")) return Boxes;
  return BookOpen;
}
