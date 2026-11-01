/** Public configuration contract for the pinned coverage producer. */
export interface SharedCoverageContract {
  version: "maxbooster-shared-vite-provider-v1";
  implementations: Record<string, string>;
  runtime: { node: string; v8: string };
  versions: Record<string, string>;
  tsconfigs: Record<string, string>;
  transform: {
    publicApi: string;
    configFile: false;
    envFile: false;
    server: { middlewareMode: true; hmr: false; watch: null };
    esbuild: Record<string, unknown>;
    tsconfig: string;
  };
  provider: {
    package: "@vitest/coverage-v8";
    hook: "remapCoverage";
    implementationSha256: string;
    ignoreClassMethods: string[];
    policy: string;
  };
  wrapper: {
    implementationSha256: string;
    encoding: "UTF-16 code units";
    prefix: string;
    suffix: string;
    length: number;
  };
}

export declare function createContract(root: string): SharedCoverageContract;
