import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/reports',
  transports: ['websocket', 'polling'],
})
export class ReportsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('ReportsGateway');

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

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
