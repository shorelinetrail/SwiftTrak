import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    // Verify the requesting user is an admin
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can invite users' }, { status: 403 });
    }

    // Get invite data
    const { email, full_name, role } = await request.json() as {
      email: string;
      full_name: string;
      role: UserRole;
    };

    if (!email || !full_name) {
      return NextResponse.json({ error: 'Email and name are required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if user already exists in auth
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingAuthUser) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    // Check if pending user exists
    const { data: existingPendingUser } = await adminClient
      .from('users')
      .select('id, status')
      .eq('email', email.toLowerCase())
      .single();

    if (existingPendingUser && existingPendingUser.status === 'active') {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    // Create or update the pending user record
    if (existingPendingUser) {
      // Update existing pending user
      await adminClient
        .from('users')
        .update({
          full_name,
          role,
          invited_by: authUser.id,
        })
        .eq('id', existingPendingUser.id);
    } else {
      // Create new pending user
      await adminClient.from('users').insert({
        id: crypto.randomUUID(),
        email: email.toLowerCase(),
        full_name,
        role,
        status: 'pending',
        invited_by: authUser.id,
        auth_linked: false,
      });
    }

    // Send the invite email using Supabase Auth
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/auth/callback`,
      data: {
        full_name,
        role,
      },
    });

    if (inviteError) {
      console.error('Failed to send invite:', inviteError);
      // Still return success if user was created - they can sign up manually
      return NextResponse.json({
        success: true,
        message: 'User created but invite email could not be sent. They can sign up manually.',
        emailSent: false,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Invite sent successfully',
      emailSent: true,
    });
  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
  }
}
