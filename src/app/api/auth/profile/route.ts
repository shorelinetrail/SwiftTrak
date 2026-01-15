import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    // Get the authenticated user from session
    const supabase = await createClient();
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use admin client to bypass RLS and fetch profile
    const adminClient = createAdminClient();

    // First try to find by ID
    let { data: profile, error: profileError } = await adminClient
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    // If not found by ID, try to find by email (for pending users who need linking)
    if (profileError && authUser.email) {
      const { data: pendingUser, error: pendingError } = await adminClient
        .from('users')
        .select('*')
        .eq('email', authUser.email.toLowerCase())
        .single();

      if (!pendingError && pendingUser) {
        console.log('[API /auth/profile] Found pending user by email, linking to auth user');

        // Delete the old pending record and create a new one with the auth user's ID
        const { error: deleteError } = await adminClient
          .from('users')
          .delete()
          .eq('id', pendingUser.id);

        if (deleteError) {
          console.error('[API /auth/profile] Failed to delete pending user:', deleteError);
        }

        // Create new user with correct ID and data from pending user
        const { data: newUser, error: insertError } = await adminClient
          .from('users')
          .insert({
            id: authUser.id,
            email: pendingUser.email,
            full_name: pendingUser.full_name,
            role: pendingUser.role,
            status: 'active',
            auth_linked: true,
            invited_by: pendingUser.invited_by,
            invited_at: pendingUser.invited_at,
            avatar_url: pendingUser.avatar_url || authUser.user_metadata?.avatar_url,
          })
          .select()
          .single();

        if (!insertError && newUser) {
          console.log('[API /auth/profile] User linked successfully:', newUser.id);
          return NextResponse.json(newUser);
        } else {
          console.error('[API /auth/profile] Failed to create linked user:', insertError);
        }
      }
    }

    if (profileError) {
      console.error('[API /auth/profile] Profile fetch error:', profileError);
      // Return default user if profile doesn't exist
      return NextResponse.json({
        id: authUser.id,
        email: authUser.email || '',
        full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
        role: 'view',
        status: 'active',
        avatar_url: authUser.user_metadata?.avatar_url,
        created_at: authUser.created_at,
        updated_at: authUser.created_at,
      });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('[API /auth/profile] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
