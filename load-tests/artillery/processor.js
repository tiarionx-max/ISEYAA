const axios = require('axios');

/**
 * Artillery processor: pre-login JWT injection for Socket.IO handshake.
 * Runs before each virtual user's scenario begins.
 * Stores the access token in context.vars.token so the Artillery socketio
 * engine can pass it via the Socket.IO auth handshake option.
 *
 * Required env vars:
 *   BASE_URL            — API base (default: https://iseyaa-api.railway.app)
 *   TEST_DRIVER_PHONE   — Driver account phone number (+234...)
 *   TEST_DRIVER_PASSWORD — Driver account password
 *   TEST_TRIP_ID        — Trip ID for GPS updates (default: load-test-trip-001)
 */
async function injectToken(context, events, done) {
  const BASE_URL = process.env.BASE_URL || 'https://iseyaa-api.railway.app';

  try {
    const res = await axios.post(
      `${BASE_URL}/api/v1/auth/login`,
      {
        phone: process.env.TEST_DRIVER_PHONE,
        password: process.env.TEST_DRIVER_PASSWORD,
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    context.vars.token = res.data.data.accessToken;
    context.vars.tripId = process.env.TEST_TRIP_ID || 'load-test-trip-001';

    return done();
  } catch (err) {
    console.error('injectToken failed', err.message);
    return done(err);
  }
}

module.exports = { injectToken };
