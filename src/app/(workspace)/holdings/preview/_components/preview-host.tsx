'use client';

import { useRouter } from 'next/navigation';
import BasePreview from '../../../../../modules/bases/components/BasePreview';

/** Full-screen 3D preview of an owned base. Exiting returns to the holdings list. */
export function PreviewHost({ bases }: { bases: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  return <BasePreview bases={bases} immersive onExit={() => router.push('/holdings')} />;
}
