export function transformFontFaceSrcToProxiedAbsoluteURL(src: string, baseRemoteURL: string | undefined, proxyPrefix: string | undefined): { transformed: string, relativeSources: string[] } {
  const relativeSources: string[] = [];
  return {
    transformed: src.replace(
      /url\(['"]?(.*?)['"]?\)/g,
      (_, relative) => {
        relativeSources.push(relative);
        const absoluteURL = baseRemoteURL !== '' ? new URL(relative, baseRemoteURL).toString() : relative;
        const resultURL = proxyPrefix === undefined ? absoluteURL : `${proxyPrefix}${encodeURIComponent(absoluteURL)}`;
        return `url("${resultURL}")`;
      },
    ),
    relativeSources,
  };
}
