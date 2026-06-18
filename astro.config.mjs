// @ts-check
import path from "path";

import { defineConfig } from 'astro/config';

import icon from 'astro-icon';
import browserslist from 'browserslist';
import { browserslistToTargets, Features } from 'lightningcss';

// https://astro.build/config
export default defineConfig({
  integrations: [icon()],

  vite: {
    resolve: {
      alias: {
        "@": path.resolve(import.meta.url, "./src"),
      },
    },
    css: {
      transformer: "lightningcss",
      lightningcss: {
        targets: browserslistToTargets(browserslist('>= 0.25%')),
        include: Features.Colors | Features.Nesting | Features.Selectors,
      },
    },
    build: {
      cssMinify: 'lightningcss'
    },
  },
});
