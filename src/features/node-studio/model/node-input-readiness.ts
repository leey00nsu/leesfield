export type NodeInputKindReadiness = {
  connectedCount: number;
  readyCount: number;
  missingCount: number;
};

export type ImageNodeInputReadiness = {
  primary: NodeInputKindReadiness;
  reference: NodeInputKindReadiness;
  connectedCount: number;
  readyCount: number;
  missingCount: number;
  resolvedCount: number;
};

function emptyKindReadiness(): NodeInputKindReadiness {
  return { connectedCount: 0, readyCount: 0, missingCount: 0 };
}

export function emptyImageNodeInputReadiness(): ImageNodeInputReadiness {
  return {
    primary: emptyKindReadiness(),
    reference: emptyKindReadiness(),
    connectedCount: 0,
    readyCount: 0,
    missingCount: 0,
    resolvedCount: 0,
  };
}
