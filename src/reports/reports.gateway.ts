import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/reports',
})
export class ReportsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() jobId: string,
  ) {
    client.join(`job:${jobId}`);
    return { success: true, message: `Subscribed to job ${jobId}` };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() jobId: string,
  ) {
    client.leave(`job:${jobId}`);
    return { success: true, message: `Unsubscribed from job ${jobId}` };
  }

  emitStatusUpdate(jobId: string, status: string, data?: any) {
    this.server.to(`job:${jobId}`).emit('status-update', {
      jobId,
      status,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}
