import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { commentNavigationForNode } from "@node-banana-runtime/upstream-node-host";
import { sortedCommentNodes, useSpaceCommentsSession, type CommentNode } from "./use-space-comments";

const node = (id: string, x = 0, y = 0, comment = id): CommentNode => ({ id, position: { x, y }, data: { comment } });

describe("Space comment sessions", () => {
  it("counts nonblank comments and follows the upstream 50px row threshold without mutating graph order", () => {
    const nodes = [node("right", 100, 0), node("left", 0, 50), node("below", -100, 101), node("blank", 0, 0, " \n")];
    expect(sortedCommentNodes(nodes).map((entry) => entry.id)).toEqual(["left", "right", "below"]);
    expect(nodes.map((entry) => entry.id)).toEqual(["right", "left", "below", "blank"]);
    const { result } = renderHook(() => useSpaceCommentsSession("alice/space", nodes));
    expect(result.current.count).toBe(3);
    expect(result.current.unreadCount).toBe(3);
  });

  it("navigates first unread then first, re-focuses the same node, and makes edited text unread", () => {
    const nodes = [node("a"), node("b", 200)];
    const { result, rerender } = renderHook(({ items }) => useSpaceCommentsSession("alice/space", items), { initialProps: { items: nodes } });
    act(() => result.current.navigateFirst());
    expect(result.current.focusedCommentNodeId).toBe("a");
    expect(result.current.unreadCount).toBe(1);
    act(() => result.current.navigateFirst());
    expect(result.current.focusedCommentNodeId).toBe("b");
    expect(result.current.unreadCount).toBe(0);
    act(() => result.current.navigateFirst());
    expect(result.current.focusedCommentNodeId).toBe("a");
    const sequence = result.current.navigationTarget!.sequence;
    act(() => result.current.navigateFirst());
    expect(result.current.navigationTarget!.sequence).toBeGreaterThan(sequence);
    rerender({ items: [node("a", 0, 0, "edited"), nodes[1]] });
    expect(result.current.viewedCommentNodeIds.has("a")).toBe(false);
    expect(result.current.unreadCount).toBe(1);
    act(() => result.current.markCommentViewed("absent"));
    expect(result.current.unreadCount).toBe(1);
  });

  it("uses actual host navigation callbacks to wrap previous/next and mark the destination read", () => {
    const nodes = [node("a"), node("b", 100), node("c", 200)];
    const { result } = renderHook(() => useSpaceCommentsSession("alice/space", nodes));
    expect(commentNavigationForNode("missing", result.current)).toBeNull();
    const first = commentNavigationForNode("a", result.current)!;
    expect(first).toMatchObject({ currentIndex: 1, totalCount: 3 });
    act(() => first.onPrevious());
    expect(result.current.focusedCommentNodeId).toBe("c");
    expect(result.current.viewedCommentNodeIds.has("c")).toBe(true);
    act(() => commentNavigationForNode("c", result.current)!.onNext());
    expect(result.current.focusedCommentNodeId).toBe("a");
  });

  it("clears deleted comment state before an identical node is restored", () => {
    const nodes = [node("a")];
    const { result, rerender } = renderHook(({ items }) => useSpaceCommentsSession("alice/space", items), { initialProps: { items: nodes } });
    act(() => result.current.navigateFirst());
    rerender({ items: [] });
    expect(result.current.navigationTarget).toBeNull();
    expect(result.current.unreadCount).toBe(0);
    rerender({ items: nodes });
    expect(result.current.navigationTarget).toBeNull();
    expect(result.current.unreadCount).toBe(1);
  });

  it("discards viewed/focus state across a scope round trip without requiring interaction in the other scope", () => {
    const nodes = [node("a")];
    const { result, rerender } = renderHook(({ scope }) => useSpaceCommentsSession(scope, nodes), { initialProps: { scope: "alice/a" } });
    act(() => result.current.navigateFirst());
    rerender({ scope: "bob/b" });
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.navigationTarget).toBeNull();
    rerender({ scope: "alice/a" });
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.navigationTarget).toBeNull();
  });
});
