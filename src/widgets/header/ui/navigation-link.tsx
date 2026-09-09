"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// Dynamic routes need a full route prefetch; wait for intent rather than
// fetching every authenticated screen just because its link is visible.
export function NavigationLink(props: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return <Link {...props} prefetch={intent}
    onMouseEnter={(event) => { setIntent(true); props.onMouseEnter?.(event); }}
    onFocus={(event) => { setIntent(true); props.onFocus?.(event); }}
    onTouchStart={(event) => { setIntent(true); props.onTouchStart?.(event); }}
  />;
}
