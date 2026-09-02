// No official types package for `imap-simple`. This engine module (email
// bridge) treats its return values as `any` internally anyway (see
// emailBridgeManager.ts), so a minimal ambient declaration is enough to
// satisfy `tsc --noEmit` without inventing a full type surface for a library
// we're only using in a handful of call sites.
declare module "imap-simple" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function connect(config: any): Promise<any>;
}
