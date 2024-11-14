import { createClient } from './supabase/client';

const ZOOM_AUTH_URL = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const CLIENT_ID = import.meta.env.VITE_ZOOM_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_ZOOM_CLIENT_SECRET;
const REDIRECT_URI = `${window.location.origin}/auth/callback`;

export const getZoomAuthUrl = async () => {
  try {
    const supabase = createClient();
    const state = crypto.randomUUID();
    
    // Store state with expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // State valid for 10 minutes

    const { error } = await supabase
      .from('oauth_states')
      .insert([{
        state,
        expires_at: expiresAt.toISOString()
      }]);

    if (error) throw error;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      state
    });

    return `${ZOOM_AUTH_URL}?${params.toString()}`;
  } catch (error) {
    console.error('Error generating auth URL:', error);
    throw error;
  }
};

export const handleZoomCallback = async (code: string, state: string): Promise<void> => {
  try {
    const supabase = createClient();
    
    // Verify state parameter
    const { data: storedState, error: stateError } = await supabase
      .from('oauth_states')
      .select('state')
      .eq('state', state)
      .single();

    if (stateError || !storedState) {
      throw new Error('Invalid state parameter');
    }

    // Clean up used state
    await supabase
      .from('oauth_states')
      .delete()
      .eq('state', state);

    // Exchange code for token
    const tokenResponse = await fetch(ZOOM_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(errorData.error_description || 'Failed to get access token');
    }

    const tokenData = await tokenResponse.json();

    // Store tokens securely
    const { error: tokenError } = await supabase
      .from('user_tokens')
      .upsert({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      });

    if (tokenError) {
      throw tokenError;
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    throw error;
  }
};