"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { ApiError } from "@/api/mutator";
import { useToast } from "./ToastProvider";

function formatApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "You do not have permission to perform this action.";
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const { pushToast } = useToast();

  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Only show toast for queries that have already loaded data once
            // (background refetch failures). Initial load errors should be
            // handled by the component's error/loading state.
            if (query.state.data !== undefined) {
              pushToast(formatApiError(error, "Failed to refresh data."));
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            // Skip if the mutation has its own onError handler
            if (mutation.options.onError) return;
            pushToast(formatApiError(error, "Something went wrong."));
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
