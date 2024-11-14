import { createClient } from '../supabase/client';
import { ZOOM_CONFIG } from './config';
import type { ZoomTokenResponse, UserToken } from './types';

export async function exchangeCodeForToken(code: string): Promise<ZoomTokenResponse> {
  const response = await fetch(ZOOM_CONFIG.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${ZOOM_CONFIG.CLIENT_ID}:${ZOOM_CONFIG.CLIENT_SECRET}`)}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ZOOM_CONFIG.REDIRECT_URI
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error_description || `Token exchange failed: ${response.statusText}`);
  }

  return response.json();
}

export async function storeTokens(tokenData: ZoomTokenResponse): Promise<void> {
  const supabase = createClient();
  
  const userToken: UserToken = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
  };

  const { error } = await supabase
    .from('user_tokens')
    .upsert(userToken);

  if (error) {
    throw new Error(`Failed to store tokens: ${error.message}`);
  }
}