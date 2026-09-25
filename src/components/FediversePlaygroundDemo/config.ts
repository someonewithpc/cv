// The playground's config, as src/config/io.ts and src/config/hostnames.ts read it, minus the
// filesystem. The GNU social instances are the repository's playground.config.example.yaml as
// it stands. Carol's Mastodon server is written in the same shape, on the source the tool's
// registry names for Mastodon.

export type SoftwareId = 'social-v3' | 'social-v2' | 'mastodon';

export type InstanceConfig = {
  software: SoftwareId;
  hostname: string;
  name: string;
  instance_id: string;
  source: { url: string; ref: string };
  branch: string;
  worktree: string;
  enabled?: boolean;
  alt_hostnames?: string[];
};

export type PlaygroundConfig = {
  defaults?: { local_tld?: string };
  instances: Record<string, InstanceConfig>;
};

export type InstanceContext = InstanceConfig & {
  key: string;
  hostnames: string[];
};

const V3_SOURCE = { url: 'git@codeberg.org:GNUsocial/gnu-social.git', ref: 'v3' };

export const exampleConfig: PlaygroundConfig = {
  defaults: { local_tld: 'fediverse' },
  instances: {
    'gnusocial-alice': {
      software: 'social-v3',
      hostname: 'alice.localhost',
      name: "Alice's Node",
      instance_id: 'gnusocial-alice',
      source: V3_SOURCE,
      branch: 'v3',
      worktree: 'instances/gnusocial-alice',
    },
    'gnusocial-bob': {
      software: 'social-v3',
      hostname: 'bob.localhost',
      name: "Bob's Node",
      instance_id: 'gnusocial-bob',
      source: V3_SOURCE,
      branch: 'main',
      worktree: 'instances/gnusocial-bob',
    },
    'gnusocial-v2': {
      software: 'social-v2',
      hostname: 'v2.localhost',
      name: 'GNU social v2',
      instance_id: 'gnusocial-v2',
      source: { url: 'https://codeberg.org/GNUsocial/gnu-social.git', ref: 'nightly' },
      branch: 'nightly',
      worktree: 'instances/gnusocial-v2',
    },
    'mastodon-carol': {
      software: 'mastodon',
      hostname: 'carol.localhost',
      name: "Carol's Mastodon",
      instance_id: 'mastodon-carol',
      source: { url: 'https://github.com/mastodon/mastodon.git', ref: 'main' },
      branch: 'main',
      worktree: 'instances/mastodon-carol',
    },
  },
};

/** The live sheet's starting point: the two v3 nodes and Mastodon up, the v2 node off. */
export const initiallyEnabled: Readonly<Record<string, boolean>> = {
  'gnusocial-alice': true,
  'gnusocial-bob': true,
  'gnusocial-v2': false,
  'mastodon-carol': true,
};

/** The config with each instance's `enabled` set from a toggle map. */
export function withEnabled(config: PlaygroundConfig, enabled: Readonly<Record<string, boolean>>): PlaygroundConfig {
  return {
    ...config,
    instances: Object.fromEntries(
      Object.entries(config.instances).map(([key, instance]) => [key, { ...instance, enabled: enabled[key] ?? true }]),
    ),
  };
}

/** hostnames.ts: the configured name, its `.<local_tld>` twin if it is a `.localhost`, then any extras. */
export function resolveHostnames(config: PlaygroundConfig, instance: InstanceConfig): string[] {
  const hostnames = new Set<string>([instance.hostname]);

  const localTld = config.defaults?.local_tld;
  if (localTld && instance.hostname.endsWith('.localhost')) {
    hostnames.add(`${instance.hostname.slice(0, -'.localhost'.length)}.${localTld}`);
  }

  instance.alt_hostnames?.forEach((hostname) => hostnames.add(hostname));

  return [...hostnames];
}

/** io.ts's loadConfig filter and listInstances, in one: disabled instances never reach a builder. */
export function listInstances(config: PlaygroundConfig): InstanceContext[] {
  return Object.entries(config.instances)
    .filter(([, instance]) => instance.enabled !== false)
    .map(([key, instance]) => ({ key, ...instance, hostnames: resolveHostnames(config, instance) }));
}
