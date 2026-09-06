"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type CommentNode = { id: string; position: { x: number; y: number }; data: { comment?: string } };
export function sortedCommentNodes(nodes: readonly CommentNode[]) {
  return nodes.filter((node) => node.data.comment?.trim()).sort((a, b) =>
    Math.abs(a.position.y - b.position.y) > 50 ? a.position.y - b.position.y : a.position.x - b.position.x);
}

// Reading/focus is deliberately session-only. The canonical presentation owns
// the text; editing it makes that comment unread again without a graph write.
export function useSpaceCommentsSession(scope: string, nodes: readonly CommentNode[]) {
  const comments = useMemo(() => sortedCommentNodes(nodes), [nodes]);
  const signature = JSON.stringify(comments.map((node) => [node.id, node.data.comment]));
  const [session, setSession] = useState<{ scope: string; signature: string; viewed: Record<string, string>; target: { nodeId: string; sequence: number } | null }>({ scope, signature, viewed: {}, target: null });
  if (session.scope !== scope || session.signature !== signature) {
    setSession({ scope, signature,
      viewed: Object.fromEntries(comments.filter((node) => session.scope === scope && session.viewed[node.id] === node.data.comment).map((node) => [node.id, node.data.comment!])),
      target: session.scope === scope && comments.some((node) => node.id === session.target?.nodeId) ? session.target : null,
    });
  }
  const viewed = useMemo(() => new Set(comments.filter((node) => session.scope === scope && session.viewed[node.id] === node.data.comment).map((node) => node.id)), [comments, scope, session]);
  const markCommentViewed = useCallback((id: string) => {
    const comment = comments.find((node) => node.id === id)?.data.comment;
    if (!comment) return;
    setSession((previous) => ({ scope, signature, target: previous.scope === scope ? previous.target : null, viewed: {
      ...Object.fromEntries(comments.filter((node) => previous.scope === scope && previous.viewed[node.id] === node.data.comment).map((node) => [node.id, node.data.comment!])), [id]: comment,
    } }));
  }, [comments, scope, signature]);
  const setNavigationTarget = useCallback((id: string) => {
    if (!comments.some((node) => node.id === id)) return;
    setSession((previous) => ({ scope, signature, viewed: previous.scope === scope ? previous.viewed : {}, target: { nodeId: id, sequence: (previous.target?.sequence ?? 0) + 1 } }));
  }, [comments, scope, signature]);
  const navigateFirst = useCallback(() => {
    const node = comments.find((entry) => !viewed.has(entry.id)) ?? comments[0];
    if (node) { markCommentViewed(node.id); setNavigationTarget(node.id); }
  }, [comments, viewed, markCommentViewed, setNavigationTarget]);
  const target = session.scope === scope && comments.some((node) => node.id === session.target?.nodeId) ? session.target : null;
  const getNodesWithComments = useCallback(() => comments, [comments]);
  const clearFocus = useCallback(() => setSession((previous) => previous.target ? { ...previous, target: null } : previous), []);
  return { getNodesWithComments, markCommentViewed, setNavigationTarget, viewedCommentNodeIds: viewed, navigationTarget: target, focusedCommentNodeId: target?.nodeId ?? null, count: comments.length, unreadCount: comments.length - viewed.size, navigateFirst, clearFocus };
}

export const SpaceCommentsContext = createContext<ReturnType<typeof useSpaceCommentsSession> | null>(null);
export function useSpaceComments() { return useContext(SpaceCommentsContext); }
