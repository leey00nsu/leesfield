import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { AssetProjectDto } from "@/shared/media-assets/asset-project-contract";
import { AssetProjectMembershipField } from "./asset-project-membership-field";

const projects: AssetProjectDto[] = [
  { id: "film", name: "Film project", parentId: null },
  { id: "portrait", name: "Portrait studies", parentId: "film" },
  { id: "street", name: "Street scenes", parentId: null },
].map(project => ({ ...project, description: "", version: 1, coverAssetId: project.id === "film" ? "cover" : null,
  cover: project.id === "film" ? { id: "cover", url: "/assets/creative-studio/film-production.jpg", imageVariants: null } : null, createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z" }));
function ProjectFieldPreview({ empty = false, error = false, loading = false }: { empty?: boolean; error?: boolean; loading?: boolean }) {
  const [selected, setSelected] = useState(empty ? [] : ["portrait"]);
  return <div className="mx-auto w-full max-w-sm p-5"><AssetProjectMembershipField value={selected} onChange={setSelected}
    projects={empty ? [] : projects} loading={loading} error={error} onRetry={() => {}} /></div>;
}
const meta = { title: "Project Design/Assets/ProjectMembership", component: ProjectFieldPreview } satisfies Meta<typeof ProjectFieldPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MultipleProjects: Story = {};
export const Empty: Story = { args: { empty: true } };
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { error: true } };
