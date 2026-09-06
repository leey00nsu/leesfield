import { NodeStudioScreen } from "@/screens/node-studio/ui/node-studio-screen";

export const metadata = { title: "Space | leesfield" };
export default async function SpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <NodeStudioScreen spaceId={spaceId} />;
}
