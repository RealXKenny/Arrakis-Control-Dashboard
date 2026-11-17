declare module 'iframe-resizer/js/iframeResizer' {
  interface ResizableFrame extends HTMLIFrameElement {
    iFrameResizer?: { removeListeners(): void };
  }
  export default function iframeResize(
    options: {
      log: boolean;
      checkOrigin: string[];
      scrolling: boolean;
      minHeight: number;
      maxHeight: number;
      warningTimeout: number;
      onInit: () => void;
      onResized: (data: { iframe: HTMLIFrameElement }) => void;
    },
    frame: HTMLIFrameElement,
  ): ResizableFrame[];
}
