import { OidcClient } from '@actions/oidc-client';
import fetch from 'node-fetch';

// This script:
// 1) requests a GitHub OIDC ID token for the configured audience
// 2) posts that ID token to the npm Trusted-Publishing token-exchange endpoint
// 3) prints the returned ephemeral npm token to stdout
//
// It expects two environment variables (provided by the workflow step env above or repository secrets):
// - NPM_OIDC_AUDIENCE: the audience to request the GitHub ID token for (provided by npm/Trusted Publishing setup).
// - NPM_OIDC_TOKEN_URL: the token exchange endpoint provided by npm for your account/org (Trusted Publishing).
//
// NOTE: The exact values for the URL and audience come from npm when you configure Trusted Publishing for your account/org.
// Place them into repo Secrets as NPM_OIDC_TOKEN_URL and NPM_OIDC_AUDIENCE.

async function main() {
  const audience = process.env.NPM_OIDC_AUDIENCE;
  const tokenExchangeUrl = process.env.NPM_OIDC_TOKEN_URL;

  if (!audience || !tokenExchangeUrl) {
    console.error('Missing NPM_OIDC_AUDIENCE or NPM_OIDC_TOKEN_URL env variables.');
    process.exitCode = 1;
    return;
  }

  try {
    // Request GitHub ID token for audience
    const oidc = new OidcClient();
    const idToken = await oidc.getIDToken(audience);
    if (!idToken) {
      console.error('Unable to obtain ID token from GitHub OIDC.');
      process.exitCode = 1;
      return;
    }

    // Exchange with npm's token endpoint
    // The exact request shape depends on npm's Trusted Publishing API.
    // Commonly it expects a JSON body containing the GitHub id_token and repository metadata.
    const body = {
      id_token: idToken,
      repository: process.env.GITHUB_REPOSITORY || ''
    };

    const res = await fetch(tokenExchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('Token exchange failed:', res.status, res.statusText, txt);
      process.exitCode = 1;
      return;
    }

    const json = await res.json();

    // The shape of the response depends on npm. Commonly the ephemeral token is returned in a field like `token` or `authToken`.
    // Try several candidate fields:
    const token = json.token || json.authToken || json.auth_token || json.npmToken || json.accessToken;
    if (!token) {
      console.error('Token exchange returned unexpected payload:', JSON.stringify(json, null, 2));
      process.exitCode = 1;
      return;
    }

    // Print only the token on stdout so the workflow can capture it
    console.log(token);
  } catch (err) {
    console.error('Error obtaining npm ephemeral token:', err);
    process.exitCode = 1;
  }
}

main();