export interface SmtpSendInput {
  to: string;
  subject: string;
  html: string;
}

export interface SmtpClient {
  send(input: SmtpSendInput): Promise<void>;
}

// T21 will fill this in to return the nodemailer-based Real adapter.
export function createFromEnv(): SmtpClient {
  throw new Error('Not implemented in T19 — T21 will wire createFromEnv to nodemailer real-smtp');
}

export { createDryRun } from './_dry-run';
