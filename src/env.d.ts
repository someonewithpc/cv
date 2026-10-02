/// <reference path="../.astro/types.d.ts" />
/// <reference types="vite/client" />

declare module 'path-data-polyfill';

// lodash-es ships no types and @types/lodash-es isn't a dependency; the deep
// paths resolve at runtime, so borrow the signatures @types/lodash already
// has for the bare package.
declare module 'lodash-es/camelCase' {
  import { camelCase } from 'lodash';
  export default camelCase;
}

declare module 'lodash-es/snakeCase' {
  import { snakeCase } from 'lodash';
  export default snakeCase;
}

declare module '/@react-refresh' {
  const runtime: {
    injectIntoGlobalHook: (env: Window) => void;
  };
  export default runtime;
}

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

declare module '*.svg?url' {
  const url: string;
  export default url;
}

declare namespace astroHTML.JSX {
  interface SVGAttributes {
    'xmlns:svg'?: string;
    'xmlns:sodipodi'?: string;
    'xmlns:inkscape'?: string;
    'xmlns:i'?: string;
    'sodipodi:docname'?: string;
    'inkscape:version'?: string;
    'inkscape:label'?: string;
    'inkscape:groupmode'?: string;
    'i:version'?: string;
    'i:knockout'?: string;
  }
}

// The few Workers runtime types src/worker.ts uses. @cloudflare/workers-types would clash with
// the DOM lib the rest of src/ is checked against.
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface DurableObjectNamespace<T> {
  getByName(name: string): { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never };
}

declare module 'cloudflare:workers' {
  export abstract class DurableObject {
    protected ctx: {
      storage: {
        get<T>(key: string): Promise<T | undefined>,
        put(key: string, value: unknown): Promise<void>,
        getAlarm(): Promise<number | null>,
        setAlarm(scheduledTime: number): Promise<void>,
        deleteAll(): Promise<void>,
      },
    };
    constructor(ctx: unknown, env: unknown);
  }
}
