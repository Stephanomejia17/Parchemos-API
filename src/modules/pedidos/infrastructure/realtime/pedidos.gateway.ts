import { WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway({ cors: true, namespace: 'pedidos' })
export class PedidosGateway {}
