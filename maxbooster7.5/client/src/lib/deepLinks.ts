export function createDeepLink(route: string, params?: Record<string, string>): string {
  const baseUrl = window.location.origin;
  let deepLink = `web+maxbooster://${route}`;
  
  if (params) {
    const queryString = new URLSearchParams(params).toString();
    deepLink += `?${queryString}`;
  }
  
  const webUrl = `${baseUrl}/${route}${params ? '?' + new URLSearchParams(params).toString() : ''}`;
  
  return webUrl;
}

export function createShareableLink(route: string, params?: Record<string, string>): {
  webUrl: string;
  deepLink: string;
} {
  const baseUrl = window.location.origin;
  const queryString = params ? new URLSearchParams(params).toString() : '';
  
  return {
    webUrl: `${baseUrl}/${route}${queryString ? '?' + queryString : ''}`,
    deepLink: `web+maxbooster://${route}${queryString ? '?' + queryString : ''}`
  };
}
