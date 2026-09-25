// src/compose/hosts.ts without the writes: which names go into the two files `generate` leaves in
// files/, and the certificate's SAN from the recipe.

import { listInstances, type PlaygroundConfig } from './config';

/** Every name any instance answers to, once, sorted. */
export function collectHostnames(config: PlaygroundConfig): string[] {
  return [...new Set(listInstances(config).flatMap((instance) => instance.hostnames))].sort();
}

/** The names nothing resolves on its own: *.localhost already points home, *.fediverse does not. */
export function collectFediverseHostnames(config: PlaygroundConfig): string[] {
  return collectHostnames(config).filter((hostname) => hostname.endsWith('.fediverse'));
}

/** The recipe's certificate: one openssl call whose SAN lists every name the instance answers to. */
export function subjectAltName(hostnames: readonly string[]): string {
  return `subjectAltName=${hostnames.map((hostname) => `DNS:${hostname}`).join(',')}`;
}
