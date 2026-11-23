/** React Email templates and the email sender (Resend, or a console/outbox sender locally). */
export { type AuthEmail, type EmailMessage, renderAuthEmail } from "./messages.tsx";
export {
  createEmailSender,
  devSender,
  EmailConfigError,
  type EmailSender,
  resendSender,
  type SenderConfig,
} from "./sender.ts";
