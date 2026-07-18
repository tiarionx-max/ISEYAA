import grpc from 'k6/net/grpc';
import { check } from 'k6';

// client.load()'s import paths are resolved relative to the k6 *entry* script's
// directory, not relative to this module's own file location — so both candidate
// paths are supplied: '../../../packages/proto' resolves correctly when this file
// is run directly (k6 run scenarios/notifications-grpc-flow.js, entry dir = scenarios/),
// while '../../packages/proto' resolves correctly when imported by main.js (entry dir
// one level shallower). k6 tries each importPath in order until the proto file is found.
const client = new grpc.Client();
client.load(['../../../packages/proto', '../../packages/proto'], 'notifications.proto');

export default function notificationsGrpcFlow() {
  client.connect(__ENV.NOTIFICATIONS_GRPC_URL || 'localhost:5008', { plaintext: true });

  try {
    const payload = {
      user_id: __ENV.TEST_USER_ID || 'k6-load-test-user',
      title: 'Load test',
      body: 'ping',
    };

    const res = client.invoke('notifications.NotificationsService/SendPush', payload);

    check(res, {
      'grpc SendPush status OK': (r) => r && r.status === grpc.StatusOK,
    });
  } finally {
    client.close();
  }
}
