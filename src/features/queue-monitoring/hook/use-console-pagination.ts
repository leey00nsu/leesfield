"use client";
import { useState } from "react";
/** Keep the live toolbar mounted while changing filters, without reusing its old cursor. */
export function useConsolePagination(filters:object) {
  const key=JSON.stringify(filters);
  const [state,setState]=useState<{key:string;cursors:(string|undefined)[]}>({key,cursors:[undefined]});
  const cursors=state.key===key?state.cursors:[undefined];
  if(state.key!==key)setState({key,cursors:[undefined]});
  return {cursors,setCursors:(update:(old:(string|undefined)[])=>(string|undefined)[])=>setState({key,cursors:update(cursors)})};
}
