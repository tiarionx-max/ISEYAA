import grpc from 'k6/net/grpc';
import { check } from 'k6';

const client = new grpc.Client();
client.load(['../../../packages/proto'], 'notifications.proto');

export default function notificationsGrpcFlow() {
  client.connect(__ENV.NOTIFICATIONS_GRPC_URL || 'localhost:5008', { plaintext: true });

  const payload = {
    user_id: __ENV.TEST_USER_ID || 'k6-load-test-user',
    title: 'Load test',
    body: 'ping',
  };

  const res = client.invoke('notifications.NotificationsService/SendPush', payload);

  check(res, {
    'grpc SendPush status OK': (r) => r && r.status === grpc.StatusOK,
  });

  client.close();
}
