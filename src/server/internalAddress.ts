// The Rails proxy this replaces refused a host when any address Resolv.getaddresses gave for it
// was IPAddr#private?: 10/8, 172.16/12, 192.168/16, fc00::/7 and their ::ffff: mapped forms.
// It let loopback and link-local through, 169.254.169.254 included. These lists keep its
// ranges and add the rest that reach this machine or its network rather than the internet.
const INTERNAL_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this network"; 0.0.0.0 reaches the local host on Linux
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata services
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and 255.255.255.255 broadcast
];

const INTERNAL_V6: [string, number][] = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['fc00::', 7], // unique local, the IPv6 private range
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local, deprecated but still routed by some stacks
  ['ff00::', 8], // multicast
];

// Prefixes whose last 32 bits are an IPv4 address the packet ends up at, judged by that address
const EMBEDS_V4: [string, number][] = [
  ['::ffff:0:0', 96], // IPv4-mapped
  ['::', 96], // IPv4-compatible, deprecated
  ['64:ff9b::', 96], // NAT64
];

export function parseIPv4(text: string): number | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    n = n * 256 + Number(part);
  }
  return n;
}

function parseGroups(text: string): number[] | null {
  if (text === '') return [];
  const parts = text.split(':');
  const groups: number[] = [];
  for (const [i, part] of parts.entries()) {
    if (i === parts.length - 1 && part.includes('.')) {
      const v4 = parseIPv4(part);
      if (v4 === null) return null;
      groups.push(v4 >>> 16, v4 & 0xffff);
    } else if (/^[0-9a-f]{1,4}$/i.test(part)) {
      groups.push(parseInt(part, 16));
    } else {
      return null;
    }
  }
  return groups;
}

export function parseIPv6(text: string): bigint | null {
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const left = parseGroups(halves[0]);
  const right = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...left, ...new Array<number>(halves.length === 2 ? missing : 0).fill(0), ...right];
  return groups.reduce((n, group) => (n << 16n) | BigInt(group), 0n);
}

function inV4(n: number, [base, bits]: [string, number]): boolean {
  return n >>> (32 - bits) === parseIPv4(base)! >>> (32 - bits);
}

function inV6(n: bigint, [base, bits]: [string, number]): boolean {
  const shift = BigInt(128 - bits);
  return n >> shift === parseIPv6(base)! >> shift;
}

/** True for an address in an internal range, and for anything that doesn't parse as one. */
export function isInternalAddress(text: string): boolean {
  const v4 = parseIPv4(text);
  if (v4 !== null) return INTERNAL_V4.some((range) => inV4(v4, range));
  const v6 = parseIPv6(text);
  if (v6 === null) return true;
  if (EMBEDS_V4.some((range) => inV6(v6, range)) && isInternalAddress(parseV4Tail(v6))) return true;
  return INTERNAL_V6.some((range) => inV6(v6, range));
}

function parseV4Tail(n: bigint): string {
  const v4 = Number(n & 0xffffffffn);
  return [v4 >>> 24, (v4 >>> 16) & 0xff, (v4 >>> 8) & 0xff, v4 & 0xff].join('.');
}

// Workers have no DNS API, and the adapter runs astro dev and preview in workerd too, without
// nodejs_compat, so node:dns isn't there either. Cloudflare's DNS-over-HTTPS JSON API is a
// plain fetch in all three.
const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const A = 1;
const AAAA = 28;

/** Every A and AAAA address the host resolves to, CNAMEs followed. Empty when it doesn't resolve. */
export async function resolveHost(host: string): Promise<string[]> {
  const answers = await Promise.all(['A', 'AAAA'].map(async (type) => {
    const query = new URL(DOH_URL);
    query.searchParams.set('name', host);
    query.searchParams.set('type', type);
    const response = await fetch(query, { headers: { accept: 'application/dns-json' } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`DNS lookup failed with ${response.status}`);
    }
    const { Answer = [] } = await response.json() as { Answer?: { type: number, data: string }[] };
    return Answer.filter((record) => record.type === A || record.type === AAAA).map((record) => record.data);
  }));
  return answers.flat();
}
