import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { CreateInstanceRequest, CreatedInstance, DeleteResult, ErrorResponse, ExecRequest, ExecResult, HealthStatus, InstanceInfo, InstanceList, KeysList, ListKeysParams, OkResult, PipelineResult } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List all storage instances
 */
export declare const getListInstancesUrl: () => string;
export declare const listInstances: (options?: RequestInit) => Promise<InstanceList>;
export declare const getListInstancesQueryKey: () => readonly ["/api/redis/instances"];
export declare const getListInstancesQueryOptions: <TData = Awaited<ReturnType<typeof listInstances>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listInstances>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listInstances>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListInstancesQueryResult = NonNullable<Awaited<ReturnType<typeof listInstances>>>;
export type ListInstancesQueryError = ErrorType<unknown>;
/**
 * @summary List all storage instances
 */
export declare function useListInstances<TData = Awaited<ReturnType<typeof listInstances>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listInstances>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a new storage instance
 */
export declare const getCreateInstanceUrl: () => string;
export declare const createInstance: (createInstanceRequest: CreateInstanceRequest, options?: RequestInit) => Promise<CreatedInstance>;
export declare const getCreateInstanceMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createInstance>>, TError, {
        data: BodyType<CreateInstanceRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createInstance>>, TError, {
    data: BodyType<CreateInstanceRequest>;
}, TContext>;
export type CreateInstanceMutationResult = NonNullable<Awaited<ReturnType<typeof createInstance>>>;
export type CreateInstanceMutationBody = BodyType<CreateInstanceRequest>;
export type CreateInstanceMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Create a new storage instance
 */
export declare const useCreateInstance: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createInstance>>, TError, {
        data: BodyType<CreateInstanceRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createInstance>>, TError, {
    data: BodyType<CreateInstanceRequest>;
}, TContext>;
/**
 * @summary Get instance info and stats (requires Bearer token)
 */
export declare const getGetInstanceUrl: (id: string) => string;
export declare const getInstance: (id: string, options?: RequestInit) => Promise<InstanceInfo>;
export declare const getGetInstanceQueryKey: (id: string) => readonly [`/api/redis/instances/${string}`];
export declare const getGetInstanceQueryOptions: <TData = Awaited<ReturnType<typeof getInstance>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getInstance>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getInstance>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetInstanceQueryResult = NonNullable<Awaited<ReturnType<typeof getInstance>>>;
export type GetInstanceQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get instance info and stats (requires Bearer token)
 */
export declare function useGetInstance<TData = Awaited<ReturnType<typeof getInstance>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getInstance>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Delete a storage instance (requires Bearer token)
 */
export declare const getDeleteInstanceUrl: (id: string) => string;
export declare const deleteInstance: (id: string, options?: RequestInit) => Promise<DeleteResult>;
export declare const getDeleteInstanceMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteInstance>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteInstance>>, TError, {
    id: string;
}, TContext>;
export type DeleteInstanceMutationResult = NonNullable<Awaited<ReturnType<typeof deleteInstance>>>;
export type DeleteInstanceMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Delete a storage instance (requires Bearer token)
 */
export declare const useDeleteInstance: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteInstance>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteInstance>>, TError, {
    id: string;
}, TContext>;
/**
 * @summary Execute a Redis-like command (requires Bearer token)
 */
export declare const getExecCommandUrl: (id: string) => string;
export declare const execCommand: (id: string, execRequest: ExecRequest, options?: RequestInit) => Promise<ExecResult>;
export declare const getExecCommandMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof execCommand>>, TError, {
        id: string;
        data: BodyType<ExecRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof execCommand>>, TError, {
    id: string;
    data: BodyType<ExecRequest>;
}, TContext>;
export type ExecCommandMutationResult = NonNullable<Awaited<ReturnType<typeof execCommand>>>;
export type ExecCommandMutationBody = BodyType<ExecRequest>;
export type ExecCommandMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Execute a Redis-like command (requires Bearer token)
 */
export declare const useExecCommand: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof execCommand>>, TError, {
        id: string;
        data: BodyType<ExecRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof execCommand>>, TError, {
    id: string;
    data: BodyType<ExecRequest>;
}, TContext>;
/**
 * @summary Execute multiple commands in a pipeline (requires Bearer token)
 */
export declare const getExecPipelineUrl: (id: string) => string;
export declare const execPipeline: (id: string, execRequest: ExecRequest[], options?: RequestInit) => Promise<PipelineResult>;
export declare const getExecPipelineMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof execPipeline>>, TError, {
        id: string;
        data: BodyType<ExecRequest[]>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof execPipeline>>, TError, {
    id: string;
    data: BodyType<ExecRequest[]>;
}, TContext>;
export type ExecPipelineMutationResult = NonNullable<Awaited<ReturnType<typeof execPipeline>>>;
export type ExecPipelineMutationBody = BodyType<ExecRequest[]>;
export type ExecPipelineMutationError = ErrorType<unknown>;
/**
 * @summary Execute multiple commands in a pipeline (requires Bearer token)
 */
export declare const useExecPipeline: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof execPipeline>>, TError, {
        id: string;
        data: BodyType<ExecRequest[]>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof execPipeline>>, TError, {
    id: string;
    data: BodyType<ExecRequest[]>;
}, TContext>;
/**
 * @summary List keys in an instance (requires Bearer token)
 */
export declare const getListKeysUrl: (id: string, params?: ListKeysParams) => string;
export declare const listKeys: (id: string, params?: ListKeysParams, options?: RequestInit) => Promise<KeysList>;
export declare const getListKeysQueryKey: (id: string, params?: ListKeysParams) => readonly [`/api/redis/instances/${string}/keys`, ...ListKeysParams[]];
export declare const getListKeysQueryOptions: <TData = Awaited<ReturnType<typeof listKeys>>, TError = ErrorType<unknown>>(id: string, params?: ListKeysParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listKeys>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listKeys>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListKeysQueryResult = NonNullable<Awaited<ReturnType<typeof listKeys>>>;
export type ListKeysQueryError = ErrorType<unknown>;
/**
 * @summary List keys in an instance (requires Bearer token)
 */
export declare function useListKeys<TData = Awaited<ReturnType<typeof listKeys>>, TError = ErrorType<unknown>>(id: string, params?: ListKeysParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listKeys>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Flush all keys in an instance (requires Bearer token)
 */
export declare const getFlushInstanceUrl: (id: string) => string;
export declare const flushInstance: (id: string, options?: RequestInit) => Promise<OkResult>;
export declare const getFlushInstanceMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof flushInstance>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof flushInstance>>, TError, {
    id: string;
}, TContext>;
export type FlushInstanceMutationResult = NonNullable<Awaited<ReturnType<typeof flushInstance>>>;
export type FlushInstanceMutationError = ErrorType<unknown>;
/**
 * @summary Flush all keys in an instance (requires Bearer token)
 */
export declare const useFlushInstance: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof flushInstance>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof flushInstance>>, TError, {
    id: string;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map