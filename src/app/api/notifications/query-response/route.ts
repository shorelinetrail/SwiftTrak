import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { queryId } = await request.json();

    if (!queryId) {
      return NextResponse.json({ error: 'Query ID required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch query with related data
    const { data: query, error } = await supabase
      .from('technical_queries')
      .select(`
        *,
        submitter:users!technical_queries_submitted_by_fkey(id, full_name, email),
        assignee:users!technical_queries_assigned_to_fkey(id, full_name, email)
      `)
      .eq('id', queryId)
      .single();

    if (error || !query) {
      return NextResponse.json({ error: 'Query not found' }, { status: 404 });
    }

    const submitter = query.submitter as { id: string; full_name: string; email: string };
    const assignee = query.assignee as { id: string; full_name: string; email: string };

    if (!submitter?.email) {
      return NextResponse.json({ error: 'Submitter email not found' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Send email to submitter
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .response { background: white; border-left: 4px solid #16a34a; padding: 16px; margin: 16px 0; }
          .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
          .footer { padding: 20px; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Query Resolved</h1>
          </div>
          <div class="content">
            <p>Hi ${submitter.full_name},</p>
            <p>Your technical query has been answered by <strong>${assignee.full_name}</strong>:</p>
            <h3>${query.title}</h3>
            <div class="response">
              ${query.response?.replace(/\n/g, '<br>') || 'No response content'}
            </div>
            <p style="margin-top: 24px;">
              <a href="${appUrl}/queries/${query.id}" class="button">View Full Response</a>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message from SwiftTrak Crisis Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendEmail({
      to: submitter.email,
      subject: `[SwiftTrak] Query Resolved: ${query.title}`,
      html,
    });

    // Create in-app notification
    await supabase.from('notifications').insert({
      user_id: submitter.id,
      type: 'query_response',
      title: 'Query Resolved',
      message: `${assignee.full_name} has responded to your query: ${query.title}`,
      entity_type: 'query',
      entity_id: query.id,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Notification error:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
