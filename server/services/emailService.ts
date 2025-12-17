import sgMail from '@sendgrid/mail';
import { emailMonitor } from '../monitoring/emailMonitor';
import { logger } from '../logger.js';
import { sendgridCircuit, queueForRetry } from './externalServices.js';
import { CircuitBreakerError, TimeoutError } from './circuitBreaker.js';

interface InvitationEmailData {
  to: string;
  inviterName: string;
  inviterEmail: string;
  projectName?: string;
  role?: string;
  inviteLink?: string;
  inviteType: 'collaboration' | 'team' | 'general';
}

interface WelcomeEmailData {
  firstName: string;
  email: string;
}

interface PasswordResetEmailData {
  firstName: string;
  resetLink: string;
  expiresIn: string;
}

interface DistributionNotificationData {
  firstName: string;
  releaseName: string;
  platforms: string[];
  status: 'submitted' | 'processing' | 'live' | 'failed';
  errorMessage?: string;
}

interface SubscriptionEmailData {
  firstName: string;
  plan: string;
  amount: string;
  nextBillingDate?: string;
}

class EmailService {
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (!this.isInitialized && process.env.SENDGRID_API_KEY) {
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.isInitialized = true;
        logger.info('✅ SendGrid EmailService initialized');
      } catch (error: unknown) {
        logger.error('❌ Failed to initialize SendGrid EmailService:', error);
      }
    } else if (!process.env.SENDGRID_API_KEY) {
      logger.warn('⚠️  SendGrid API key not configured. Email features will be disabled.');
    }
  }

  private async sendWithCircuitBreaker(
    emailData: sgMail.MailDataRequired,
    shouldQueue: boolean = true
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      await sendgridCircuit.execute(() => sgMail.send(emailData));
      const deliveryTime = Date.now() - startTime;
      emailMonitor.logEmail(emailData, 'sent', undefined, deliveryTime);
      return true;
    } catch (error: unknown) {
      const deliveryTime = Date.now() - startTime;
      let errorMessage: string;

      if (error instanceof CircuitBreakerError) {
        errorMessage = `Circuit breaker open: ${error.message}`;
        logger.warn(`⚡ SendGrid circuit breaker is OPEN, skipping email to ${emailData.to}`);
      } else if (error instanceof TimeoutError) {
        errorMessage = `Timeout: ${error.message}`;
        logger.warn(`⏱️ SendGrid timeout for email to ${emailData.to}`);
      } else {
        errorMessage =
          (error as any)?.response?.body?.errors?.[0]?.message ||
          (error as Error).message ||
          'Unknown error';
      }

      emailMonitor.logEmail(emailData, 'failed', errorMessage, deliveryTime);

      if (shouldQueue && !(error instanceof CircuitBreakerError)) {
        queueForRetry('sendgrid', 'send_email', {
          to: emailData.to,
          subject: emailData.subject,
        });
        logger.info(`📥 Email to ${emailData.to} queued for retry`);
      }

      return false;
    }
  }

  async sendInvitationEmail(data: InvitationEmailData): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('⚠️  SendGrid not initialized, skipping invitation email to:', data.to);
      return false;
    }

    const template = this.getInvitationTemplate(data);
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'invitations@maxbooster.ai';

    const emailData = {
      to: data.to,
      from: fromEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    };

    const success = await this.sendWithCircuitBreaker(emailData);
    if (success) {
      logger.info(`📧 Invitation email sent to ${data.to} from ${data.inviterName}`);
    }
    return success;
  }

  async sendCollaborationInvite(
    to: string,
    inviterName: string,
    inviterEmail: string,
    projectName: string,
    role: string
  ): Promise<boolean> {
    return this.sendInvitationEmail({
      to,
      inviterName,
      inviterEmail,
      projectName,
      role,
      inviteType: 'collaboration',
    });
  }

  async sendTeamInvite(
    to: string,
    inviterName: string,
    inviterEmail: string,
    role: string
  ): Promise<boolean> {
    return this.sendInvitationEmail({
      to,
      inviterName,
      inviterEmail,
      role,
      inviteType: 'team',
    });
  }

  async sendGeneralInvite(
    to: string,
    inviterName: string,
    inviterEmail: string,
    inviteLink?: string
  ): Promise<boolean> {
    return this.sendInvitationEmail({
      to,
      inviterName,
      inviterEmail,
      inviteLink,
      inviteType: 'general',
    });
  }

  async sendTicketCreatedEmail(
    to: string,
    userName: string,
    ticketSubject: string,
    ticketId: string
  ): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('⚠️  SendGrid not initialized, skipping ticket created email');
      return false;
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'support@maxbooster.ai';

    const emailData = {
      to,
      from: fromEmail,
      subject: `Support Ticket Created: ${ticketSubject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
          <div style="background-color: #f3f4f6; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Support Ticket Created</h1>
              </div>
              <div style="padding: 30px;">
                <p>Hi ${userName},</p>
                <p>Your support ticket has been successfully created. Our team will review it and respond as soon as possible.</p>
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; font-weight: bold;">Subject:</p>
                  <p style="margin: 5px 0 0;">${ticketSubject}</p>
                  <p style="margin: 15px 0 0; font-weight: bold;">Ticket ID:</p>
                  <p style="margin: 5px 0 0;">${ticketId}</p>
                </div>
                <p>You can track the status of your ticket in your account dashboard.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://maxbooster.ai/support/tickets/${ticketId}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px;">View Ticket</a>
                </div>
                <p style="color: #6b7280; font-size: 14px;">Thank you for using Max Booster!</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nYour support ticket has been created.\n\nSubject: ${ticketSubject}\nTicket ID: ${ticketId}\n\nOur team will respond as soon as possible.\n\nView your ticket: https://maxbooster.ai/support/tickets/${ticketId}`,
    };

    return this.sendWithCircuitBreaker(emailData);
  }

  async sendTicketReplyEmail(
    to: string,
    userName: string,
    ticketSubject: string,
    ticketId: string,
    replyMessage: string
  ): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('⚠️  SendGrid not initialized, skipping ticket reply email');
      return false;
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'support@maxbooster.ai';
    const truncatedMessage =
      replyMessage.length > 200 ? replyMessage.substring(0, 200) + '...' : replyMessage;

    const emailData = {
      to,
      from: fromEmail,
      subject: `New Reply on: ${ticketSubject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
          <div style="background-color: #f3f4f6; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 24px;">New Support Reply</h1>
              </div>
              <div style="padding: 30px;">
                <p>Hi ${userName},</p>
                <p>You have a new reply on your support ticket:</p>
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; font-weight: bold;">Ticket:</p>
                  <p style="margin: 5px 0 15px;">${ticketSubject}</p>
                  <p style="margin: 0; font-weight: bold;">Reply:</p>
                  <p style="margin: 5px 0 0;">${truncatedMessage}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://maxbooster.ai/support/tickets/${ticketId}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px;">View Full Conversation</a>
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nYou have a new reply on your support ticket: ${ticketSubject}\n\nReply: ${truncatedMessage}\n\nView full conversation: https://maxbooster.ai/support/tickets/${ticketId}`,
    };

    return this.sendWithCircuitBreaker(emailData);
  }

  async sendTicketStatusUpdateEmail(
    to: string,
    userName: string,
    ticketSubject: string,
    ticketId: string,
    newStatus: string
  ): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('⚠️  SendGrid not initialized, skipping ticket status update email');
      return false;
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'support@maxbooster.ai';
    const statusMessages: Record<string, string> = {
      open: 'Your ticket is now open and awaiting review.',
      in_progress: 'Our team is actively working on your ticket.',
      resolved: 'Your ticket has been resolved!',
      closed: 'Your ticket has been closed.',
    };

    const emailData = {
      to,
      from: fromEmail,
      subject: `Ticket Status Update: ${ticketSubject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
          <div style="background-color: #f3f4f6; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Ticket Status Updated</h1>
              </div>
              <div style="padding: 30px;">
                <p>Hi ${userName},</p>
                <p>The status of your support ticket has been updated:</p>
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; font-weight: bold;">Ticket:</p>
                  <p style="margin: 5px 0 15px;">${ticketSubject}</p>
                  <p style="margin: 0; font-weight: bold;">New Status:</p>
                  <p style="margin: 5px 0 0; color: #667eea; font-size: 18px; text-transform: uppercase;">${newStatus.replace('_', ' ')}</p>
                  <p style="margin: 10px 0 0; color: #6b7280;">${statusMessages[newStatus] || 'Status has been updated.'}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://maxbooster.ai/support/tickets/${ticketId}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px;">View Ticket</a>
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${userName},\n\nYour support ticket status has been updated to: ${newStatus.replace('_', ' ').toUpperCase()}\n\nTicket: ${ticketSubject}\n\n${statusMessages[newStatus] || 'Status has been updated.'}\n\nView ticket: https://maxbooster.ai/support/tickets/${ticketId}`,
    };

    return this.sendWithCircuitBreaker(emailData);
  }

  async sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('⚠️  SendGrid not initialized, skipping welcome email');
      return false;
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'welcome@maxbooster.ai';
    const html = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🎵 Welcome to Max Booster!</h1>
      </div>
      <div style="padding: 30px;">
        <p>Hi ${data.firstName},</p>
        <p>Welcome to <strong>Max Booster</strong> – your all-in-one music career management platform!</p>
        <p>You now have access to:</p>
        <ul style="color: #4b5563; line-height: 1.8;">
          <li>🎹 <strong>Studio One-Inspired DAW</strong> – Professional music production in your browser</li>
          <li>🌍 <strong>Distribution to 34+ Platforms</strong> – Spotify, Apple Music, YouTube Music, and more</li>
          <li>📱 <strong>Social Media Management</strong> – Schedule posts across all platforms</li>
          <li>💰 <strong>Marketplace</strong> – Sell beats, samples, and services</li>
          <li>📊 <strong>Analytics</strong> – Track your growth and earnings</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://maxbooster.ai/dashboard" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px;">Go to Dashboard</a>
        </div>
        <p>Let's make some amazing music together! 🎶</p>
        <p>Best,<br>The Max Booster Team</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const emailData = {
      to: data.email,
      from: fromEmail,
      subject: '🎵 Welcome to Max Booster - Your Music Career Starts Here!',
      html,
      text: `Hi ${data.firstName},\n\nWelcome to Max Booster!\n\nYou now have access to our complete platform including Studio, Distribution, Social Media Management, Marketplace, and Analytics.\n\nGet started: https://maxbooster.ai/dashboard\n\nBest,\nThe Max Booster Team`,
    };

    const success = await this.sendWithCircuitBreaker(emailData);
    if (success) {
      logger.info(`📧 Welcome email sent to ${data.email}`);
    }
    return success;
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData, to: string): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('⚠️  SendGrid not initialized, skipping password reset email');
      return false;
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'security@maxbooster.ai';
    const html = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🔒 Password Reset Request</h1>
      </div>
      <div style="padding: 30px;">
        <p>Hi ${data.firstName},</p>
        <p>We received a request to reset your Max Booster password. Click the button below to create a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.resetLink}" style="display: inline-block; padding: 12px 30px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a>
        </div>
        <p><strong>This link expires in ${data.expiresIn}.</strong></p>
        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold;">⚠️ Security Notice:</p>
          <ul style="margin: 10px 0 0 0;">
            <li>If you didn't request this reset, please ignore this email</li>
            <li>Never share this link with anyone</li>
            <li>Max Booster will never ask for your password via email</li>
          </ul>
        </div>
        <p style="word-break: break-all; font-size: 12px; color: #666;">Alternatively, copy this link: ${data.resetLink}</p>
        <p>Best,<br>The Max Booster Team</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const emailData = {
      to,
      from: fromEmail,
      subject: '🔒 Reset Your Max Booster Password',
      html,
      text: `Hi ${data.firstName},\n\nWe received a request to reset your password.\n\nReset link: ${data.resetLink}\n\nThis link expires in ${data.expiresIn}.\n\nIf you didn't request this, please ignore this email.\n\nBest,\nThe Max Booster Team`,
    };

    const success = await this.sendWithCircuitBreaker(emailData);
    if (success) {
      logger.info(`📧 Password reset email sent to ${to}`);
    }
    return success;
  }

  async sendDistributionNotification(
    data: DistributionNotificationData,
    to: string
  ): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('⚠️  SendGrid not initialized, skipping distribution notification');
      return false;
    }

    const statusEmojis = {
      submitted: '📤',
      processing: '⚙️',
      live: '🎉',
      failed: '❌',
    };

    const statusTitles = {
      submitted: 'Release Submitted',
      processing: 'Release Processing',
      live: 'Release is Live!',
      failed: 'Distribution Failed',
    };

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'distribution@maxbooster.ai';
    const platformsTags = data.platforms
      .map(
        (p) =>
          `<span style="display: inline-block; background: #e0e7ff; color: #4c51bf; padding: 5px 12px; border-radius: 12px; margin: 3px; font-size: 13px;">${p}</span>`
      )
      .join('');

    const html = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px;">${statusEmojis[data.status]} ${statusTitles[data.status]}</h1>
      </div>
      <div style="padding: 30px;">
        <p>Hi ${data.firstName},</p>
        <p>Your release "<strong>${data.releaseName}</strong>" ${data.status === 'live' ? 'is now live!' : `status: ${data.status}`}</p>
        <div style="background: white; padding: 15px; border-radius: 4px; margin: 15px 0;">
          <strong>Platforms:</strong><br>
          ${platformsTags}
        </div>
        ${
          data.status === 'failed' && data.errorMessage
            ? `
        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
          <strong>Error Details:</strong><br>${data.errorMessage}
        </div>
        `
            : ''
        }
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://maxbooster.ai/distribution" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px;">View Distribution Status</a>
        </div>
        <p>Best,<br>The Max Booster Team</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const emailData = {
      to,
      from: fromEmail,
      subject: `${statusEmojis[data.status]} ${statusTitles[data.status]}: ${data.releaseName}`,
      html,
      text: `Hi ${data.firstName},\n\nYour release "${data.releaseName}" status: ${data.status}\n\nPlatforms: ${data.platforms.join(', ')}\n\n${data.errorMessage || ''}\n\nView status: https://maxbooster.ai/distribution\n\nBest,\nThe Max Booster Team`,
    };

    const success = await this.sendWithCircuitBreaker(emailData);
    if (success) {
      logger.info(`📧 Distribution notification sent to ${to}`);
    }
    return success;
  }

  async sendSubscriptionConfirmation(data: SubscriptionEmailData, to: string): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('⚠️  SendGrid not initialized, skipping subscription confirmation');
      return false;
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'billing@maxbooster.ai';
    const html = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <div style="background-color: #f3f4f6; padding: 40px 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🎉 Subscription Confirmed!</h1>
      </div>
      <div style="padding: 30px;">
        <p>Hi ${data.firstName},</p>
        <p>Thank you for subscribing to Max Booster! Your payment has been processed successfully.</p>
        <div style="background: white; border: 2px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
          <h2 style="margin: 0; color: #667eea;">${data.plan}</h2>
          <div style="font-size: 36px; font-weight: bold; color: #667eea; margin: 10px 0;">${data.amount}</div>
          ${data.nextBillingDate ? `<p style="margin: 0; color: #666;">Next billing: ${data.nextBillingDate}</p>` : '<p style="margin: 0; color: #666;">Lifetime Access</p>'}
        </div>
        <p>You now have full access to all Max Booster features!</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://maxbooster.ai/dashboard" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px;">Go to Dashboard</a>
        </div>
        <p>Best,<br>The Max Booster Team</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const emailData = {
      to,
      from: fromEmail,
      subject: '🎉 Welcome to Max Booster! Your Subscription is Active',
      html,
      text: `Hi ${data.firstName},\n\nThank you for subscribing to Max Booster!\n\nPlan: ${data.plan}\nAmount: ${data.amount}\n${data.nextBillingDate ? `Next billing: ${data.nextBillingDate}` : 'Lifetime Access'}\n\nView dashboard: https://maxbooster.ai/dashboard\n\nBest,\nThe Max Booster Team`,
    };

    const success = await this.sendWithCircuitBreaker(emailData);
    if (success) {
      logger.info(`📧 Subscription confirmation sent to ${to}`);
    }
    return success;
  }

  private getInvitationTemplate(data: InvitationEmailData): {
    subject: string;
    html: string;
    text: string;
  } {
    const { inviterName, inviterEmail, projectName, role, inviteLink, inviteType } = data;

    let subject = '';
    let mainMessage = '';
    let actionButton = '';

    switch (inviteType) {
      case 'collaboration':
        subject = `${inviterName} invited you to collaborate on "${projectName}"`;
        mainMessage = `
          <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
            <strong>${inviterName}</strong> (${inviterEmail}) has invited you to collaborate on the project <strong>"${projectName}"</strong>.
          </p>
          <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
            Your role: <strong>${role || 'Collaborator'}</strong>
          </p>
          <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
            Log in to Max Booster to view the project and start collaborating!
          </p>
        `;
        actionButton = `<a href="https://maxbooster.ai/dashboard" style="display: inline-block; margin: 20px 0; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View Project</a>`;
        break;

      case 'team':
        subject = `${inviterName} invited you to join their team on Max Booster`;
        mainMessage = `
          <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
            <strong>${inviterName}</strong> (${inviterEmail}) has invited you to join their team on Max Booster.
          </p>
          <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
            Your role: <strong>${role || 'Team Member'}</strong>
          </p>
          <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
            Join their team to collaborate on music projects, manage releases, and grow together!
          </p>
        `;
        actionButton = `<a href="https://maxbooster.ai/dashboard" style="display: inline-block; margin: 20px 0; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Accept Invitation</a>`;
        break;

      case 'general':
        subject = `${inviterName} invited you to Max Booster`;
        mainMessage = `
          <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
            <strong>${inviterName}</strong> (${inviterEmail}) has invited you to join Max Booster, the AI-powered music career management platform.
          </p>
          <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
            Max Booster helps artists distribute music, manage royalties, create AI-powered content, and grow their music career.
          </p>
        `;
        actionButton = inviteLink
          ? `<a href="${inviteLink}" style="display: inline-block; margin: 20px 0; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Accept Invitation</a>`
          : `<a href="https://maxbooster.ai/pricing" style="display: inline-block; margin: 20px 0; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Get Started</a>`;
        break;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Max Booster</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">AI-Powered Music Platform</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 24px; font-weight: 600;">🎵 You've Been Invited!</h2>
              ${mainMessage}
              <div style="text-align: center;">
                ${actionButton}
              </div>
              <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; color: #6b7280; font-size: 14px;">
                  If you have any questions, feel free to reply to this email or contact ${inviterName} directly at ${inviterEmail}.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 12px;">
                © ${new Date().getFullYear()} Max Booster. All rights reserved.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                This invitation was sent by ${inviterName} via Max Booster.
                <br>If you did not expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const text = `
${subject}

${inviterName} (${inviterEmail}) has invited you ${inviteType === 'collaboration' ? `to collaborate on "${projectName}"` : 'to Max Booster'}.

${role ? `Your role: ${role}` : ''}

${inviteType === 'collaboration' ? 'Log in to Max Booster to view the project and start collaborating!' : ''}
${inviteType === 'team' ? 'Join their team to collaborate on music projects and grow together!' : ''}
${inviteType === 'general' ? 'Max Booster helps artists distribute music, manage royalties, create AI-powered content, and grow their music career.' : ''}

${inviteLink || 'https://maxbooster.ai/dashboard'}

If you have any questions, feel free to contact ${inviterName} at ${inviterEmail}.

---
Max Booster - AI-Powered Music Platform
© ${new Date().getFullYear()} Max Booster. All rights reserved.

This invitation was sent by ${inviterName} via Max Booster.
If you did not expect this invitation, you can safely ignore this email.
    `.trim();

    return {
      subject,
      html,
      text,
    };
  }
}

export const emailService = new EmailService();
