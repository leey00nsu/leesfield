"use client";

import { createContext, useContext } from "react";
import type { NodeExecutionDto } from "./node-execution-types";

/** Root tracking and node history share one query and the same fresh-read guard. */
export const NodeExecutionReadContext = createContext<{
  graphId: string;
  read: (nodeId: string, signal: AbortSignal) => Promise<NodeExecutionDto[]>;
} | null>(null);

export function useNodeExecutionReader() { return useContext(NodeExecutionReadContext); }
