import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { AppError } from '../../../lib/errors';
import { recordAudit } from '../../../lib/security/audit';
import type { TransferDeps } from '../transfers/service';
import { consoleGateway } from './console-gateway';
import { transferStore } from './transfer-store';
import { applyWalletOperation } from './wallet-store';

/** Server-enforced activation gate for every real Solaris deposit, withdrawal and wager. */
export function assertTransfersEnabled(): void {
  if (!getServerEnv().CASINO_SOLARIS_ENABLED)
    throw new AppError(
      'The Solaris Exchange is closed. Real Solaris play is not enabled.',
      403,
      'FEATURE_DISABLED',
      true,
    );
}

export function transferDeps(): TransferDeps {
  return {
    console: consoleGateway,
    wallet: { apply: applyWalletOperation },
    intents: transferStore,
    now: () => Date.now(),
    audit: (event) => void recordAudit(event),
    assertEnabled: assertTransfersEnabled,
  };
}
