/**
 * Minimal type declaration for the `keytar` native module.
 * keytar provides OS-native credential storage (Keychain/Credential Manager/libsecret).
 *
 * This declaration is used because @types/keytar is not available as a separate package —
 * keytar ships its own types in newer versions, but the installed version (7.9.0) may not.
 */
declare module 'keytar' {
  export function setPassword(service: string, account: string, password: string): Promise<void>;
  export function getPassword(service: string, account: string): Promise<string | null>;
  export function deletePassword(service: string, account: string): Promise<boolean>;
  export function findPassword(service: string): Promise<string | null>;
  export function findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}
