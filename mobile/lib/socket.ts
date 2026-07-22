import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './api';

// The Transport and Delivery WebSocket gateways run on the same HTTP server as the
// REST API, on the default namespace/path — not under /api/v1. Strip the REST prefix
// to get the bare origin socket.io-client needs to connect to.
const SOCKET_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '');

let socket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

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
    await new Promise<void>((resolve, reject) => {
      socket!.once('connect', () => resolve());
      socket!.once('connect_error', (err) => reject(err));
    });
    return socket!;
  })();

  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
