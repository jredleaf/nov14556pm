import { createClient } from '../supabase/client';
import type { OAuthState } from './types';

export async function createOAuthState(): Promise<string> {
  const supabase = createClient();
  const state = crypto.randomUUID();
  
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  const { error } = await supabase
    .from('oauth_states')
    .insert([{
      state,
      expires_at: expiresAt.toISOString()
    }]);

  if (error) {
    throw new Error(`Failed to create OAuth state: ${error.message}`);
  }

  return state;
}

export async function verifyAndDeleteState(state: string): Promise<void> {
  const supabase = createClient();
  
  const { data, error: fetchError } = await supabase
    .from('oauth_states')
    .select('state, expires_at')
    .eq('state', state)
    .single();

  if (fetchError || !data) {
    throw new Error('Invalid or expired state parameter');
  }

  const { expires_at } = data as OAuthState;
  if (new Date(expires_at) < new Date()) {
    throw new Error('State parameter has expired');
  }

  const { error: deleteError } = await supabase
    .from('oauth_states')
    .delete()
    .eq('state', state);

  if (deleteError) {
    console.error('Failed to delete used state:', deleteError);
  }
}