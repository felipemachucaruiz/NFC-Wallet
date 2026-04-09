import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface UseQueryOptions<
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  > {
    queryKey?: TQueryKey;
  }
}
