// Temporary ambient module declarations to satisfy TypeScript when module resolution fails in strict mode.
declare module "zustand" {
  export type StateCreator<T> = unknown;
  // create<T>() returns a hook; keep it as any to avoid leaking types
  export function create<T>(): any;
}

declare module "zustand/middleware" {
  export const persist: any;
  export const createJSONStorage: any;
}
