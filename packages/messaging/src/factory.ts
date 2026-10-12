import type { MessagingGateway } from "./gateway";
import { SimulatedMessaging } from "./simulated";
import { WhatsappGateway } from "./whatsapp";
import { hasWhatsapp } from "./config";

/** Never throws. Unconfigured → SimulatedMessaging (logs, no network). */
export function getMessagingGateway(): MessagingGateway {
  return hasWhatsapp() ? new WhatsappGateway() : new SimulatedMessaging();
}
