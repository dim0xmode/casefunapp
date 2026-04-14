import { Request, Response, NextFunction } from 'express';
import { Resend } from 'resend';
import { AppError } from '../middleware/errorHandler.js';

const BATCH_SIZE = 50;

const getResendClient = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new AppError('RESEND_API_KEY is not configured', 500);
  return new Resend(key);
};

const getFromAddress = () =>
  process.env.RESEND_FROM || 'CaseFun <noreply@casefun.net>';

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const wrapInHtml = (subject: string, text: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body { margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; -webkit-text-size-adjust: 100%; }
    .wrapper { max-width: 560px; margin: 32px auto; background-color: #13131a; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.07); }
    .header { background-color: #0d0d14; padding: 28px 40px; text-align: center; border-bottom: 1px solid rgba(102,252,241,0.12); }
    .logo-case { font-size: 28px; font-weight: 900; color: #ffffff; letter-spacing: -1px; font-family: Arial Black, Arial, sans-serif; }
    .logo-fun { font-size: 28px; font-weight: 900; color: #66FCF1; letter-spacing: -1px; font-family: Arial Black, Arial, sans-serif; }
    .tagline { font-size: 11px; color: #555566; letter-spacing: 3px; text-transform: uppercase; margin-top: 6px; }
    .body { padding: 36px 40px; }
    .text { color: #c8c8d4; font-size: 15px; line-height: 1.75; white-space: pre-wrap; word-break: break-word; }
    .divider { height: 1px; background-color: rgba(255,255,255,0.06); margin: 16px 0; }
    .cta-wrap { text-align: center; margin-top: 14px; }
    .cta { display: inline-block; background-color: #0d0d14; padding: 12px 28px; border-radius: 10px; text-decoration: none; border: 1px solid rgba(102,252,241,0.3); box-shadow: 0 0 16px rgba(102,252,241,0.12), inset 0 0 10px rgba(102,252,241,0.04); }
    .cta-case { font-size: 18px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; font-family: Arial Black, Arial, sans-serif; }
    .cta-fun { font-size: 18px; font-weight: 900; color: #66FCF1; letter-spacing: -0.5px; font-family: Arial Black, Arial, sans-serif; }
    .cta-sub { display: block; font-size: 9px; color: rgba(102,252,241,0.5); letter-spacing: 3px; text-transform: uppercase; margin-top: 3px; font-family: Arial, sans-serif; }
    .footer { padding: 12px 40px 16px; text-align: center; }
    .footer-text { color: #3a3a4a; font-size: 10px; line-height: 1.5; }
    .footer-text a { color: #4a4a5a; text-decoration: underline; }
    @media only screen and (max-width: 600px) {
      .wrapper { margin: 0; border-radius: 0; border-left: none; border-right: none; }
      .header, .body, .footer { padding-left: 24px; padding-right: 24px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div>
        <span class="logo-case">CASE</span><span class="logo-fun">FUN</span>
      </div>
    </div>
    <div class="body">
      <div class="text">${escapeHtml(text)}</div>
      <div class="divider"></div>
      <div class="cta-wrap">
        <a href="https://casefun.net" class="cta">
          <span class="cta-case">CASE</span><span class="cta-fun">FUN</span>
        </a>
      </div>
    </div>
    <div class="footer">
      <div class="footer-text">
        © ${new Date().getFullYear()} CaseFun &nbsp;·&nbsp;
        <a href="https://casefun.net">casefun.net</a><br/>
        You received this email because you signed up on CaseFun.<br/>
        <a href="https://casefun.net">Unsubscribe</a>
      </div>
    </div>
  </div>
</body>
</html>`;

export const sendMailingBatch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { emails, subject, text } = req.body ?? {};

    if (!Array.isArray(emails) || emails.length === 0) {
      return next(new AppError('emails must be a non-empty array', 400));
    }
    if (emails.length > BATCH_SIZE) {
      return next(new AppError(`Max ${BATCH_SIZE} emails per batch`, 400));
    }
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return next(new AppError('subject is required', 400));
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      return next(new AppError('text is required', 400));
    }

    const validEmails = emails
      .map((e: any) => String(e || '').trim().toLowerCase())
      .filter(isValidEmail);

    if (validEmails.length === 0) {
      return next(new AppError('No valid email addresses provided', 400));
    }

    const resend = getResendClient();
    const from = getFromAddress();
    const subjectTrimmed = subject.trim();
    const textTrimmed = text.trim();
    const html = wrapInHtml(subjectTrimmed, textTrimmed);

    // Plain text fallback keeps spam score low
    const plainText = `${textTrimmed}\n\n──────────────\nCaseFun · https://casefun.net\nTo unsubscribe: https://casefun.net`;

    const batch = validEmails.map((to) => ({
      from,
      to,
      subject: subjectTrimmed,
      html,
      text: plainText,
      headers: {
        'List-Unsubscribe': '<https://casefun.net>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));

    const { data, error } = await resend.batch.send(batch);

    if (error) {
      console.error('[mailing] Resend batch error:', error);
      return next(new AppError(`Resend error: ${error.message}`, 502));
    }

    const sent = Array.isArray(data) ? data.length : validEmails.length;

    return res.json({
      status: 'success',
      data: {
        sent,
        requested: validEmails.length,
        skipped: emails.length - validEmails.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
