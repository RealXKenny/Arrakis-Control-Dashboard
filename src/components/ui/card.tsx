import { createElement, type ComponentPropsWithRef } from 'react';
import { cardClass } from './control-styles';

type CardProps = ComponentPropsWithRef<'article'> & {
  as?: 'article' | 'section' | 'aside' | 'div';
};

/** A semantic surface, never an implicit clickable control. */
export function Card({ as: Element = 'article', className, ...props }: CardProps) {
  return createElement(Element, { ...props, className: className ?? cardClass() });
}
