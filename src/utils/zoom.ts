import axios from 'axios';
import { createClient } from './supabase/client';

const ZOOM_API_BASE_URL = 'https://api.zoom.us/v2';
const ZOOM_AUTH_URL = 'https://zoom.us/oauth/token';
const REDIRECT_URI = 'https://enchanting-melomakarona-031069.netlify.app/auth/callback';

interface ZoomTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export const handleZoomCallback = async (code: string): Promise<void> => {
  try {
    const clientId = import.meta.env.VITE_ZOOM_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_ZOOM_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing Zoom OAuth credentials');
    }

    const authHeader = btoa(`${clientId}:${clientSecret}`);

    const response = await axios.post<ZoomTokenResponse>(
      ZOOM_AUTH_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Store tokens in Supabase
    const supabase = createClient();
    const { error } = await supabase
      .from('user_tokens')
      .upsert({
        access_token,
        refresh_token,
        expires_at: expiresAt,
      });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error handling Zoom callback:', error);
    throw error;
  }
};

export const generateZoomAccessToken = async (): Promise<string | null> => {
  try {
    const supabase = createClient();
    const { data: tokenData, error } = await supabase
      .from('user_tokens')
      .select('*')
      .single();

    if (error || !tokenData) {
      throw new Error('No token found');
    }

    if (new Date(tokenData.expires_at) <= new Date()) {
      // Token has expired, refresh it
      const response = await axios.post<ZoomTokenResponse>(
        ZOOM_AUTH_URL,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenData.refresh_token,
        }),
        {
          headers: {
            'Authorization': `Basic ${btoa(`${import.meta.env.VITE_ZOOM_CLIENT_ID}:${import.meta.env.VITE_ZOOM_CLIENT_SECRET}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      // Update tokens in Supabase
      await supabase
        .from('user_tokens')
        .update({
          access_token,
          refresh_token,
          expires_at: expiresAt,
        })
        .eq('id', tokenData.id);

      return access_token;
    }

    return tokenData.access_token;
  } catch (error) {
    console.error('Error generating Zoom access token:', error);
    return null;
  }
};

export const makeZoomApiRequest = async <T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: any
): Promise<T | null> => {
  try {
    const accessToken = await generateZoomAccessToken();
    
    if (!accessToken) {
      throw new Error('Failed to generate access token');
    }

    const response = await axios({
      method,
      url: `${ZOOM_API_BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data,
    });

    return response.data;
  } catch (error) {
    console.error('Error making Zoom API request:', error);
    return null;
  }
};

export const getCurrentUser = async () => {
  return makeZoomApiRequest('/users/me');
};

export const getMeeting = async (meetingId: string) => {
  return makeZoomApiRequest(`/meetings/${meetingId}`);
};

export const createMeeting = async (userId: string, meetingData: any) => {
  return makeZoomApiRequest(`/users/${userId}/meetings`, 'POST', meetingData);
};