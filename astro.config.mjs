// @ts-check
import path from "path";

import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    // astro-icon → @iconify/utils needs Node (tty, etc.) during prerender/dev
    prerenderEnvironment: 'node',
  }),
  compressHTML: true,
  integrations: [icon()],

  vite: {
    resolve: {
      alias: {
        lodash: 'lodash-es',
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  },
});
