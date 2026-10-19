export const mediaSelectionExample = `const response = await fetch(
  API_BASE_URL + "/api/external/spaces/" + SPACE_ID,
  { headers: { "X-API-Key": API_KEY } },
);
if (!response.ok) throw new Error(await response.text());
const { space } = await response.json();

const saved = await fetch(
  API_BASE_URL + "/api/external/spaces/" + SPACE_ID,
  {
    method: "PUT",
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      schemaVersion: 3,
      expectedVersion: space.version,
      title: space.title,
      nodes: space.nodes.map(node => node.id === NODE_ID
        ? { ...node, selectedOutputAssetId: ASSET_ID } : node),
      edges: space.edges,
      groups: space.groups,
      selectionChanges: [NODE_ID],
    }),
  },
);
if (!saved.ok) throw new Error(await saved.text());`;
