/// <reference path="../.astro/types.d.ts" />
/// <reference types="vite/client" />

declare module 'path-data-polyfill';

// Only the one binding this project reads at runtime.
declare module 'cloudflare:workers' {
  export const env: {
    ASSETS: { fetch: typeof fetch };
  };
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
