import http from 'k6/http';

/**
 * Fetch a JWT access token from the ISEYAA auth endpoint.
 * Used by scenario scripts that require an authenticated request.
 *
 * @param {string} baseUrl - Base URL e.g. "https://iseyaa-api.railway.app"
 * @param {string} phone   - Registered test phone number (+234...)
 * @param {string} password - Test account password
 * @returns {string} accessToken
 */
export function getToken(baseUrl, phone, password) {
  const res = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({ phone, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return res.json('data.accessToken');
}
