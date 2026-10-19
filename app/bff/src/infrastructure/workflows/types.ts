import type { IWhatsAppGateway } from '../../domain/ports/index.js';

/** The only gateway call the paced sender needs. */
export type IGatewayLike = Pick<IWhatsAppGateway, 'sendText'>;
