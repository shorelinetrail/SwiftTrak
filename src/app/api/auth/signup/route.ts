import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { email, password, full_name } = await request.json() as {
      email: string;
      password: string;
      full_name: string;
    };

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    // Create user in auth with email confirmed (skip email verification)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
      },
    });

    if (authError) {
      console.error('[API /auth/signup] Auth error:', authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Check if there's a pending user record to link
    const { data: pendingUser } = await adminClient
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (pendingUser) {
      // Delete pending record and create new one with auth ID
      await adminClient.from('users').delete().eq('id', pendingUser.id);

      await adminClient.from('users').insert({
        id: authData.user.id,
        email: pendingUser.email,
        full_name: pendingUser.full_name || full_name,
        role: pendingUser.role,
        status: 'active',
        auth_linked: true,
        invited_by: pendingUser.invited_by,
        invited_at: pendingUser.invited_at,
      });
    } else {
      // Create new user record
      await adminClient.from('users').insert({
        id: authData.user.id,
        email: email.toLowerCase(),
        full_name,
        role: 'view',
        status: 'active',
        auth_linked: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      userId: authData.user.id,
    });
  } catch (error) {
    console.error('[API /auth/signup] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
