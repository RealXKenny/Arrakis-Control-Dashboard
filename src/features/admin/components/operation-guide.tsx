import type { AdminOperation } from '../types';
import { ui } from './ui';
export default function OperationGuide({ operation }: { operation: AdminOperation }) {
  return (
    <div className={ui.operationGuide}>
      <dl>
        <div>
          <dt>Purpose</dt>
          <dd>{operation.title}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {operation.provider === 'adapter'
              ? 'Discord adapter · ADAPTER_TOKEN'
              : 'Console API · ADMIN_CONSOLE_API_KEY'}
          </dd>
        </div>
        <div>
          <dt>Behavior</dt>
          <dd>
            {operation.method === 'GET'
              ? operation.mode === 'events'
                ? 'Read-only live stream, bounded to 60 seconds and 2 MiB.'
                : operation.mode === 'download'
                  ? 'Read-only download, streamed up to 128 MiB.'
                  : 'Read-only request. Inspect the result without changing server state.'
              : 'Changes server state. Review the target and confirm before executing; writes are never retried automatically.'}
          </dd>
        </div>
        {operation.files?.length ? (
          <div>
            <dt>Files</dt>
            <dd>{operation.files.join(', ')} · combined limit 8 MiB</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
