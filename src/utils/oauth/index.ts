import { ZOOM_CONFIG } from './config';
import { createOAuthState, verifyAndDeleteState } from './state';
import { exchangeCodeForToken, storeTokens } from './tokens';

export async function getZoomAuthUrl(): Promise<string> {
  try {
    const state = await createOAuthState();
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: ZOOM_CONFIG.CLIENT_ID,
      redirect_uri: ZOOM_CONFIG.REDIRECT_URI,
      state
    });

    return `${ZOOM_CONFIG.AUTH_URL}?${params.toString()}`;
  } catch (error) {
    console.error('Failed to generate auth URL:', error);
    throw new Error('Failed to initialize OAuth flow');
  }
}

export async function handleZoomCallback(code: string, state: string): Promise<void> {
  try {
    // Step 1: Verify state parameter
    await verifyAndDeleteState(state);

    // Step 2: Exchange code for tokens
    const tokenData = await exchangeCodeForToken(code);

    // Step 3: Store tokens
    await storeTokens(tokenData);
  } catch (error) {
    console.error('OAuth callback failed:', error);
    throw error instanceof Error ? error : new Error('Authentication failed');
  }
}