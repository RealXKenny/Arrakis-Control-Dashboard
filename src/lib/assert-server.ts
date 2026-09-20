if (typeof window !== 'undefined') {
  throw new Error('Server infrastructure must not be imported into browser code.');
}

export {};
