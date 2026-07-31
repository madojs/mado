/**
 * Development instrumentation overlay.
 *
 * Applications should load this subpath conditionally behind
 * `import.meta.env.DEV` before mounting.
 */
export type DevtoolsLogLevel = "debug" | "info" | "warn" | "error" | "silent";
export interface DevtoolsRecord {
    id: number;
    time: number;
    kind: string;
    targetId?: number;
    data?: unknown;
}
export interface DevtoolsSnapshot {
    version: 1;
    paused: boolean;
    records: DevtoolsRecord[];
}
export interface DevtoolsController {
    open(): void;
    close(): void;
    toggle(): void;
    clear(): void;
    setLogLevel(level: DevtoolsLogLevel): void;
    snapshot(): DevtoolsSnapshot;
}
export declare const devtools: DevtoolsController;
