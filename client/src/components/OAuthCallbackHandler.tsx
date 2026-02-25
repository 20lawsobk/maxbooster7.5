import { useEffect } from 'react';

const OAUTH_CALLBACK_PATTERN = /^\/auth\/([^/]+)\/callback$/;

export function OAuthCallbackHandler() {
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(OAUTH_CALLBACK_PATTERN);
    if (!match) return;

    const platform = match[1];
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (!code && !error) return;

    const apiUrl = `/api/social/callback/${platform}${search}`;
    window.location.replace(apiUrl);
  }, []);

  return null;
}
