import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { API_BASE, refreshAccessToken } from './api';

// The Transport and Delivery WebSocket gateways run on the same HTTP server as the
// REST API, on the default namespace/path — not under /api/v1. Strip the REST prefix
// to get the bare origin socket.io-client needs to connect to.
const SOCKET_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '');

let socket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

function waitForConnect(s: Socket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', (err) => reject(err));
  });
}

export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const token = await SecureStore.getItemAsync('access_token');
    if (socket) socket.disconnect();
    socket = io(SOCKET_ORIGIN, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });

    try {
      await waitForConnect(socket);
      return socket;
    } catch (err) {
      // A connect_error here is almost always the 15-minute access token expiring:
      // the gateway rejects the handshake, and with reconnection:true socket.io would
      // otherwise retry that same dead token forever. Refresh once, swap the token
      // into auth, and reconnect. If refresh fails there's no way back in — tear the
      // socket down and surface the error rather than looping on a stale credential.
      const newToken = await refreshAccessToken();
      if (!newToken) {
        socket.disconnect();
        socket = null;
        throw err;
      }
      socket.auth = { token: newToken };
      socket.disconnect().connect();
      await waitForConnect(socket);
      return socket;
    }
  })();

  try {
    return await connectPromise;
  } catch (err) {
    // Ensure a failed attempt doesn't leave a half-connected instance cached.
    socket = null;
    throw err;
  } finally {
    connectPromise = null;
  }
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
