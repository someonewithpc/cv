import { experimental_AstroContainer as AstroContainer } from 'astro/container';

import OEmbedCard from '@/components/OEmbedCard.astro';
import { AUTHOR_NAME, CONTACT, SITE_TITLE, SITE_URL } from '@/site';

// The card embeds this snippet directly, not the live page: hsal.es is a full interactive
// site (demos, canvases, drag-and-drop), and without an explicit "rich" html a consumer that
// wants a visual preview will fall back to iframing the raw url, which tries to run all of it
// inside a tiny frame. Both endpoints are prerendered, so this runs once per astro build and
// the card always comes from the same source as the rest of the site.
export async function oembedFields() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(OEmbedCard, {
    props: { title: SITE_TITLE, name: AUTHOR_NAME, href: SITE_URL, email: CONTACT.email, profiles: CONTACT.profiles },
  });

  return {
    version: '1.0',
    type: 'rich',
    title: SITE_TITLE,
    author_name: AUTHOR_NAME,
    provider_name: AUTHOR_NAME,
    provider_url: SITE_URL,
    cache_age: 86400,
    width: 360,
    height: 150,
    html: html.trim(),
  };
}
