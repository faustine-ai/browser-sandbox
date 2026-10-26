// Stable error names a consumer can match on. The class is one; the name is
// the contract.

export type SandboxErrorName =
  | 'SandboxUnavailable'
  | 'ApprovalRejected'
  | 'UnknownFunction'
  | 'CloneError'
  | 'SandboxLimit'
  | 'ReplayMismatch'
  | 'BadDecision'
  | 'PendingObserved'
  | 'InvalidRun';

export class SandboxError extends Error {
  override readonly name: SandboxErrorName;
  constructor(name: SandboxErrorName, message: string) {
    super(message);
    this.name = name;
  }
}

export function errorShape(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name || 'Error', message: err.message };
  return { name: 'Error', message: String(err) };
}
