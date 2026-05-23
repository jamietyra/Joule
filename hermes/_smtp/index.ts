import { createRealSmtp } from './_real-smtp';

export interface SmtpSendInput {
  to: string;
  subject: string;
  html: string;
}

export interface SmtpClient {
  send(input: SmtpSendInput): Promise<void>;
}

export function createFromEnv(): SmtpClient {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD env vars are required (see .env.example)');
  }
  return createRealSmtp({ user, appPassword: pass });
}

export { createDryRun } from './_dry-run';
export { createRealSmtp } from './_real-smtp';
