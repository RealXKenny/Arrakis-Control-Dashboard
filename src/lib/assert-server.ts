/** Pages Router and instrumentation execute outside React's server-component condition. */
if (typeof window !== 'undefined') {
  throw new Error('Server infrastructure must not be imported into browser code.');
}

export {};
