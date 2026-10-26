import { ImageIcon, Video, AudioLines, Scissors, Sparkles, HardDrive } from "lucide-react";
import type { ConsoleKind, ConsoleJob } from "@/shared/api/job-queue-console-contract";
const icons = { generate_image: ImageIcon, generate_video: Video, generate_audio: AudioLines, media_operation: Scissors, assistant: Sparkles, storage_cleanup: HardDrive };
export function QueueKindIcon({kind,className="size-5"}:{kind:ConsoleKind;className?:string}) { const Icon=icons[kind]; return <Icon className={className} aria-hidden="true"/>; }
export function queueDisplayTitle(job:ConsoleJob,fallback:string) { return job.title.startsWith(job.sourceType+" · ") ? fallback : job.title; }
