import nodemailer from 'nodemailer';
import type { SmtpClient, SmtpSendInput } from './index';

export interface RealSmtpConfig {
  user: string;
  appPassword: string;
}

export function createRealSmtp(config: RealSmtpConfig): SmtpClient {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.user,
      pass: config.appPassword,
    },
  });

  return {
    async send(input: SmtpSendInput): Promise<void> {
      await transporter.sendMail({
        from: config.user,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
    },
  };
}
