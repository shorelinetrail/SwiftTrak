import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, generateQueryAssignedEmail } from '@/lib/email';

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

    const assignee = query.assignee as { id: string; full_name: string; email: string };
    const submitter = query.submitter as { id: string; full_name: string; email: string };

    if (!assignee?.email) {
      return NextResponse.json({ error: 'Assignee email not found' }, { status: 400 });
    }

    // Send email to assignee
    const html = generateQueryAssignedEmail({
      queryTitle: query.title,
      assigneeName: assignee.full_name,
      submitterName: submitter.full_name,
      priority: query.priority,
      description: query.description,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      queryId: query.id,
    });

    const result = await sendEmail({
      to: assignee.email,
      subject: `[SwiftTrak] Technical Query Assigned: ${query.title}`,
      html,
    });

    // Create in-app notification
    await supabase.from('notifications').insert({
      user_id: assignee.id,
      type: 'query_assigned',
      title: 'Technical Query Assigned',
      message: `${submitter.full_name} has submitted a query: ${query.title}`,
      entity_type: 'query',
      entity_id: query.id,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Notification error:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
