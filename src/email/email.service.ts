import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendPasswordResetEmail(email: string, resetToken: string) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    try {
      await this.resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'Password Reset Request - Betting Platform',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #000; font-size: 24px; margin-bottom: 16px;">Password Reset Request</h2>
            <p style="color: #333; font-size: 16px; line-height: 24px; margin-bottom: 24px;">
              You requested to reset your password. Click the button below to create a new password.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetUrl}" style="display: inline-block; background-color: #007AFF; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 20px; margin-bottom: 8px;">
              Or copy and paste this link in your browser:
            </p>
            <p style="color: #007AFF; font-size: 14px; word-break: break-all; margin-bottom: 24px;">
              ${resetUrl}
            </p>
            <p style="color: #999; font-size: 12px; line-height: 18px;">
              This link will expire in 1 hour. If you didn't request this, please ignore this email.
            </p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
    }
  }
}
