// src/compose/builder.ts and the two recipes in src/recipes/gnu-social.ts, ported to run in a
// browser. What is left out is what touches the disk: each recipe's configure() (nginx rewrite,
// certificates, .env.local) and the file write. The merge, the shared-service dedupe, the web
// volumes and depends_on, and the validation are the builder's own, line for line.

import { listInstances, type InstanceContext, type PlaygroundConfig } from './config';

export type Service = Record<string, unknown>;

export type ComposeFile = {
  version: string;
  name: string;
  services: Record<string, Service>;
  volumes: Record<string, Record<string, never>>;
};

type Dependency = { type: string; shared?: boolean };

type Contribution = {
  services: Record<string, Service>;
  webVolumes?: string[];
  appServiceNames?: string[];
};

type Recipe = {
  id: string;
  displayName: string;
  dependencies: Dependency[];
  buildContribution: (instance: InstanceContext) => Contribution;
};

/** The dev default every install script and the db container agree on; it is not a secret. */
export const DEV_PASSWORD = 'fediverse-playground';

export const SHARED_SERVICES: Record<string, Service> = {
  web: {
    image: 'nginx:alpine',
    restart: 'always',
    tty: false,
    ports: ['8080:80', '8443:443'],
    volumes: [
      './files/nginx.conf:/etc/nginx/nginx.conf',
      './files/letsencrypt/options-ssl-nginx.conf:/etc/letsencrypt/options-ssl-nginx.conf',
      './files/letsencrypt/ssl-dhparams.pem:/etc/letsencrypt/ssl-dhparams.pem',
    ],
    command: '/bin/sh -c \'rm /etc/nginx/conf.d/default.conf; nginx -g "daemon off;"\'',
  },
  db: {
    image: 'postgres:alpine',
    restart: 'always',
    tty: false,
    environment: ['PGDATA=/var/lib/postgresql/data', `POSTGRES_PASSWORD=${DEV_PASSWORD}`, 'POSTGRES_USER=postgres'],
    volumes: ['database:/var/lib/postgresql/data'],
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U postgres'], interval: '3s', timeout: '3s', retries: 30 },
  },
  redis: {
    image: 'redis:alpine',
    restart: 'always',
    tty: false,
    volumes: ['./files/redis.conf:/etc/redis/redis.conf'],
    command: 'redis-server /etc/redis/redis.conf',
  },
  mariadb: {
    image: 'mariadb:10.3',
    restart: 'always',
    tty: false,
    environment: ['MYSQL_ALLOW_EMPTY_PASSWORD=1', 'MYSQL_DATABASE=gnusocial'],
    volumes: ['mariadb:/var/lib/mysql'],
    command: 'mysqld --character-set-server=utf8mb4 --collation-server=utf8mb4_bin',
    healthcheck: { test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'], interval: '3s', timeout: '3s', retries: 30 },
  },
};

const installServiceName = (instanceId: string) => `${instanceId}-install`;

const completedInstall = (serviceName: string) => ({
  [serviceName]: { condition: 'service_completed_successfully' },
});

const v3Environment = (instance: InstanceContext) => [
  'SOCIAL_DBMS=postgres',
  'DBMS=postgres',
  `SOCIAL_DB=${instance.instance_id}`,
  'SOCIAL_USER=postgres',
  `POSTGRES_PASSWORD=${DEV_PASSWORD}`,
  `SOCIAL_PASSWORD=${DEV_PASSWORD}`,
  `CONFIG_DOMAIN=${instance.hostname}`,
  `CONFIG_NODE_NAME=${instance.name}`,
  'SOCIAL_ADMIN_EMAIL=',
  'SOCIAL_SITE_PROFILE=public',
];

const gnuSocialV3: Recipe = {
  id: 'social-v3',
  displayName: 'GNU social v3',
  dependencies: [
    { type: 'web', shared: true },
    { type: 'db', shared: true },
    { type: 'redis', shared: true },
    { type: 'social-v3-php', shared: false },
  ],
  buildContribution: (instance) => {
    const installer = installServiceName(instance.instance_id);

    return {
      appServiceNames: [instance.instance_id],
      services: {
        [installer]: {
          build: `${instance.worktree}/docker/php`,
          restart: 'no',
          depends_on: { db: { condition: 'service_healthy' } },
          environment: v3Environment(instance),
          volumes: [
            `./${instance.worktree}:/var/www/social`,
            `./${instance.worktree}/docker/db/wait_for_db.sh:/wait_for_db.sh`,
            './install/social-v3.sh:/playground/install.sh:ro',
            './install/seed-v3-admin.php:/playground/seed-v3-admin.php:ro',
          ],
          command: ['sh', '/playground/install.sh'],
        },
        [instance.instance_id]: {
          build: `${instance.worktree}/docker/php`,
          restart: 'always',
          tty: true,
          depends_on: {
            db: { condition: 'service_healthy' },
            redis: { condition: 'service_started' },
            ...completedInstall(installer),
          },
          environment: v3Environment(instance),
          volumes: [
            `./${instance.worktree}:/var/www/social`,
            `./${instance.worktree}/docker/php/entrypoint.sh:/entrypoint.sh`,
            `./${instance.worktree}/docker/db/wait_for_db.sh:/wait_for_db.sh`,
            '/var/www/social/docker',
          ],
          command: '/entrypoint.sh',
        },
      },
      webVolumes: [
        `./${instance.worktree}/public:/var/www/${instance.instance_id}/public`,
        `./files/${instance.instance_id}.nginx.conf:/etc/nginx/conf.d/${instance.instance_id}.nginx.conf`,
        `./files/${instance.hostname}/:/etc/letsencrypt/live/${instance.hostname}`,
      ],
    };
  },
};

const gnuSocialV2: Recipe = {
  id: 'social-v2',
  displayName: 'GNU social v2',
  dependencies: [
    { type: 'web', shared: true },
    { type: 'mariadb', shared: true },
  ],
  buildContribution: (instance) => {
    const installer = installServiceName(instance.instance_id);

    return {
      appServiceNames: [instance.instance_id],
      services: {
        [installer]: {
          build: `${instance.worktree}/docker/development`,
          restart: 'no',
          depends_on: { mariadb: { condition: 'service_healthy' } },
          environment: [
            `CONFIG_DOMAIN=${instance.hostname}`,
            `CONFIG_NODE_NAME=${instance.name}`,
            `INSTALL_SERVER=${instance.hostname}:8443`,
          ],
          volumes: [`./${instance.worktree}:/var/www/`, './install/social-v2.sh:/playground/install.sh:ro'],
          command: ['sh', '/playground/install.sh'],
        },
        [instance.instance_id]: {
          build: `${instance.worktree}/docker/development`,
          restart: 'always',
          depends_on: {
            mariadb: { condition: 'service_healthy' },
            ...completedInstall(installer),
          },
          volumes: [`./${instance.worktree}:/var/www/`, `./${instance.worktree}/public:/var/www/html`],
        },
      },
      webVolumes: [
        `./files/${instance.instance_id}.nginx.conf:/etc/nginx/conf.d/${instance.instance_id}.nginx.conf`,
        `./files/${instance.hostname}/:/etc/letsencrypt/live/${instance.hostname}`,
      ],
    };
  },
};

/** registry.ts's FUTURE_RECIPES: software it names, with a source repository, and has no recipe for yet. */
export const PLANNED_RECIPES = ['mastodon', 'lemmy', 'friendica', 'gnu-social-v1'] as const;

/** The registry holds these two and nothing else. */
export const RECIPES: Record<string, Recipe> = {
  'social-v3': gnuSocialV3,
  'social-v2': gnuSocialV2,
};

function getRecipe(software: string): Recipe {
  const recipe = RECIPES[software];
  if (!recipe) throw new Error(`Unknown software recipe "${software}"`);
  return recipe;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** utils/array.ts: lodash's mergeWith, where two arrays meeting concatenate instead of overwriting
    by index. It mutates and returns `first`, as mergeWith does. */
export function mergeObjectsWithArrayConcat<T extends Record<string, unknown>>(first: T, second: Record<string, unknown>): T {
  const target = first as Record<string, unknown>;
  Object.entries(second).forEach(([key, source]) => {
    const existing = target[key];
    if (Array.isArray(source) || Array.isArray(existing)) {
      target[key] = [...((existing as unknown[]) ?? []), ...((source as unknown[]) ?? [])];
    } else if (isObject(source)) {
      target[key] = mergeObjectsWithArrayConcat(isObject(existing) ? existing : {}, source);
    } else if (source !== undefined) {
      target[key] = source;
    }
  });
  return first;
}

/** Every name a service's depends_on lists, whichever of Compose's two forms it uses. */
export function dependenciesOf(service: Service): string[] {
  const dependsOn = service.depends_on;
  if (!dependsOn) return [];
  return Array.isArray(dependsOn) ? (dependsOn as string[]) : Object.keys(dependsOn as Record<string, unknown>);
}

/** The builder refuses to write a file whose depends_on names a service that is not in it. */
export function validateCompose(compose: ComposeFile): void {
  Object.entries(compose.services).forEach(([service, definition]) => {
    dependenciesOf(definition).forEach((dependency) => {
      if (!compose.services[dependency]) {
        throw new Error(`Service "${service}" depends on "${dependency}", but it is not defined`);
      }
    });
  });
}

export function buildComposeFile(config: PlaygroundConfig): ComposeFile {
  const compose: ComposeFile = {
    version: '3',
    name: 'fediverse-playground',
    services: {},
    volumes: { database: {}, mariadb: {} },
  };

  const sharedAdded = new Set<string>();
  const webVolumes: string[] = [];
  const webDependsOn: string[] = [];

  for (const instance of listInstances(config)) {
    const recipe = getRecipe(instance.software);
    const contribution = recipe.buildContribution(instance);

    // A shared dependency is emitted by the first recipe that asks for it, and never again.
    for (const dependency of recipe.dependencies) {
      if (dependency.shared && !sharedAdded.has(dependency.type)) {
        const sharedService = SHARED_SERVICES[dependency.type];
        if (sharedService) {
          compose.services[dependency.type] = structuredClone(sharedService);
          sharedAdded.add(dependency.type);
        }
      }
    }

    compose.services = mergeObjectsWithArrayConcat(compose.services, contribution.services);

    if (contribution.webVolumes?.length) {
      webVolumes.push(...contribution.webVolumes);
      const appServices = contribution.appServiceNames
        ?? Object.keys(contribution.services).filter((name) => !name.endsWith('-install'));
      webDependsOn.push(...appServices);
    }
  }

  // nginx mounts every instance's config and certificate, and waits on every app.
  if (compose.services.web) {
    compose.services.web = {
      ...compose.services.web,
      volumes: [...((compose.services.web.volumes as string[]) ?? []), ...webVolumes],
      depends_on: [...new Set(webDependsOn.filter((name) => compose.services[name]))],
    };
  }

  validateCompose(compose);
  return compose;
}
