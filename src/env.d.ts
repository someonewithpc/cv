/// <reference path="../.astro/types.d.ts" />

declare module 'path-data-polyfill';

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
