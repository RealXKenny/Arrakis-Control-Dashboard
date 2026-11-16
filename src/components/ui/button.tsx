import type { ComponentPropsWithRef } from 'react';
import { buttonClass, focusRing } from './control-styles';

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

/** Native button semantics, including form submission, refs and caller-owned ARIA state. */
export function Button({ variant, className, ...props }: ButtonProps) {
  const styles =
    variant || !className
      ? buttonClass({ variant, className })
      : `${className} ${focusRing} disabled:cursor-not-allowed`;
  return <button {...props} className={styles} />;
}
