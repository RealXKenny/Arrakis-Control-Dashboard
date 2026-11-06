import ConsoleHandoff from '../components/ConsoleHandoff';
import { ReadPanel } from '../components/DataPanel';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

export default function DirectoryScreen({
  operations,
  consoleOrigin,
}: {
  operations: AdminOperation[];
  consoleOrigin: string | null;
}) {
  return (
    <div className={css.screen}>
      <ReadPanel operations={operations} id="get-public-directory-status" title="Public directory status" />
      <p className={css.stateLine}>
        This is the status the Console reports. Whether the directory lists your server is decided by the Console and
        the directory service, not by this dashboard.
      </p>
      <ConsoleHandoff
        operations={operations}
        ids={[
          'post-settings-public-directory',
          'post-settings-public-directory-claim',
          'get-settings',
          'post-settings',
        ]}
        consoleOrigin={consoleOrigin}
        heading="Editing, claiming and global settings"
      />
    </div>
  );
}
