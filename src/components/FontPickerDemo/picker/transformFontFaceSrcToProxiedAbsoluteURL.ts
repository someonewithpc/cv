export function transformFontFaceSrcToProxiedAbsoluteURL(src: string, baseRemoteURL: string | undefined, proxyPrefix: string | undefined): { transformed: string, relativeSources: string[] } {
  const relativeSources: string[] = [];
  return {
    transformed: src.replace(
      /url\(['"]?(.*?)['"]?\)/g,
      (_, relative) => {
        // A data: or blob: source needs no fetching and the proxy refuses anything but
        // http(s), so it goes back as it is; only the fetched ones are listed for the
        // preconnect check, whose URL parse has no host to read off an inline source.
        if (/^(data|blob):/i.test(relative)) return `url("${relative}")`;
        relativeSources.push(relative);
        const absoluteURL = baseRemoteURL !== '' ? new URL(relative, baseRemoteURL).toString() : relative;
        const resultURL = proxyPrefix === undefined ? absoluteURL : `${proxyPrefix}${encodeURIComponent(absoluteURL)}`;
        return `url("${resultURL}")`;
      },
    ),
    relativeSources,
  };
}
