import { Resend } from 'resend';

// Lazily initialize Resend client to avoid build-time errors
let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: process.env.EMAIL_FROM || 'SwiftTrak <noreply@swifttrak.app>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });

    if (error) {
      console.error('Email send error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error };
  }
}

export function generateActionAssignedEmail(params: {
  actionTitle: string;
  assigneeName: string;
  workstream: string;
  priority: string;
  dueDate?: string;
  description?: string;
  appUrl: string;
  actionId: string;
}) {
  const { actionTitle, assigneeName, workstream, priority, dueDate, description, appUrl, actionId } = params;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .priority { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .priority-critical { background: #dc2626; color: white; }
        .priority-high { background: #f97316; color: white; }
        .priority-medium { background: #eab308; color: black; }
        .priority-low { background: #22c55e; color: white; }
        .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
        .footer { padding: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Action Assigned</h1>
        </div>
        <div class="content">
          <p>Hi ${assigneeName},</p>
          <p>You have been assigned a new action in SwiftTrak:</p>
          <h2 style="margin: 16px 0 8px;">${actionTitle}</h2>
          <p><strong>Workstream:</strong> ${workstream}</p>
          <p><strong>Priority:</strong> <span class="priority priority-${priority}">${priority.toUpperCase()}</span></p>
          ${dueDate ? `<p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>` : ''}
          ${description ? `<p><strong>Description:</strong> ${description}</p>` : ''}
          <p style="margin-top: 24px;">
            <a href="${appUrl}/actions/${actionId}" class="button">View Action</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated message from SwiftTrak Crisis Management System.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateMentionEmail(params: {
  mentionedName: string;
  mentionerName: string;
  entityType: string;
  entityTitle: string;
  content: string;
  appUrl: string;
  entityId: string;
}) {
  const { mentionedName, mentionerName, entityType, entityTitle, content, appUrl, entityId } = params;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .quote { background: white; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
        .footer { padding: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">You were mentioned</h1>
        </div>
        <div class="content">
          <p>Hi ${mentionedName},</p>
          <p><strong>${mentionerName}</strong> mentioned you in a ${entityType}:</p>
          <h3>${entityTitle}</h3>
          <div class="quote">${content}</div>
          <p style="margin-top: 24px;">
            <a href="${appUrl}/${entityType}s/${entityId}" class="button">View ${entityType}</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated message from SwiftTrak Crisis Management System.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateQueryAssignedEmail(params: {
  queryTitle: string;
  assigneeName: string;
  submitterName: string;
  priority: string;
  description: string;
  appUrl: string;
  queryId: string;
}) {
  const { queryTitle, assigneeName, submitterName, priority, description, appUrl, queryId } = params;

  const priorityLabels: Record<string, string> = {
    urgent: 'URGENT - Immediate Response Required',
    high: 'HIGH - Response Required Within Hours',
    medium: 'MEDIUM - Response Required Within 1 Day',
    low: 'LOW - Response Required Within 2-3 Days',
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #7c3aed; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .priority { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .priority-urgent { background: #dc2626; color: white; }
        .priority-high { background: #f97316; color: white; }
        .priority-medium { background: #eab308; color: black; }
        .priority-low { background: #22c55e; color: white; }
        .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
        .footer { padding: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Technical Query Assigned</h1>
        </div>
        <div class="content">
          <p>Hi ${assigneeName},</p>
          <p><strong>${submitterName}</strong> has submitted a technical query requiring your response:</p>
          <h2 style="margin: 16px 0 8px;">${queryTitle}</h2>
          <p><span class="priority priority-${priority}">${priorityLabels[priority]}</span></p>
          <p><strong>Description:</strong></p>
          <p>${description}</p>
          <p style="margin-top: 24px;">
            <a href="${appUrl}/queries/${queryId}" class="button">Respond to Query</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated message from SwiftTrak Crisis Management System.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
