// O runtime de scripts do Bedrock expõe um console mínimo.
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
