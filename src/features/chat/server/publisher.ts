import '../../../lib/assert-server';
import { createLogger } from '../../../lib/logger';
import { getChatConfig } from './config';
import { RabbitChatTransport } from './rabbitmq';

const log = createLogger('CHAT');
const globals = globalThis as typeof globalThis & { arrakisChatPublisher?: RabbitChatTransport };

export function getChatPublisher(): RabbitChatTransport {
  const config = getChatConfig();
  if (!config) throw new Error('Live chat is not enabled.');
  if (!globals.arrakisChatPublisher) {
    globals.arrakisChatPublisher = new RabbitChatTransport(config, undefined, (level, message) => log[level](message));
    globals.arrakisChatPublisher.start();
    const stop = () => {
      void globals.arrakisChatPublisher?.stop();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  return globals.arrakisChatPublisher;
}
