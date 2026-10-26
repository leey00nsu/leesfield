"use client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { consoleParams, fetchQueueConsole } from "../api/queue-console-api";
export const queueConsoleKey=["queue-console"] as const;
export function useQueueConsole<T>(path:string,params:Record<string,unknown>={},options:{enabled?:boolean;poll?:boolean}={}){
  return useQuery({queryKey:[...queueConsoleKey,path,consoleParams(params)],
    queryFn:({signal})=>fetchQueueConsole<T>(path,params,signal),enabled:options.enabled??true,
    retry:false,staleTime:1000,refetchOnWindowFocus:false,refetchOnReconnect:false,
    refetchInterval:options.poll?4000:false,refetchIntervalInBackground:false,
  });
}

export function useQueueConsoleHistory<T>(path:string) {
  return useInfiniteQuery({
    queryKey:[...queueConsoleKey,"history",path],
    initialPageParam:undefined as string|undefined,
    queryFn:({pageParam,signal})=>fetchQueueConsole<import("@/shared/api/job-queue-console-contract").ConsolePage<T>>(path,{limit:20,cursor:pageParam},signal),
    getNextPageParam:page=>page.nextCursor??undefined,
    retry:false,staleTime:1000,refetchOnWindowFocus:false,refetchOnReconnect:false,
  });
}
