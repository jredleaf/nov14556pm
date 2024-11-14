export interface ZoomTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface OAuthState {
  state: string;
  expires_at: string;
}

export interface UserToken {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}