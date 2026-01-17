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

    const adminClient = createAdminClient();

    // First try to find by auth_id (for users who have signed up with new system)
    let { data: profile, error: profileError } = await adminClient
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single();

    // If not found by auth_id, try by id (for existing users where id = auth.id)
    if (profileError) {
      const { data: existingUser, error: existingError } = await adminClient
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (!existingError && existingUser) {
        // Found by id - update auth_id if not set
        if (!existingUser.auth_id) {
          await adminClient
            .from('users')
            .update({ auth_id: authUser.id })
            .eq('id', authUser.id);
          existingUser.auth_id = authUser.id;
        }
        return NextResponse.json(existingUser);
      }
    }

    // If not found by auth_id or id, try to find pending user by email
    if (profileError && authUser.email) {
      const { data: pendingUser, error: pendingError } = await adminClient
        .from('users')
        .select('*')
        .eq('email', authUser.email.toLowerCase())
        .eq('status', 'pending')
        .single();

      if (!pendingError && pendingUser) {
        // Link the pending user by setting auth_id - UUID stays the same!
        const { data: linkedUser, error: linkError } = await adminClient
          .from('users')
          .update({
            auth_id: authUser.id,
            status: 'active',
            auth_linked: true,
            full_name: authUser.user_metadata?.full_name || pendingUser.full_name,
            avatar_url: pendingUser.avatar_url || authUser.user_metadata?.avatar_url,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pendingUser.id)
          .select()
          .single();

        if (linkError) {
          console.error('[API /auth/profile] Failed to link pending user:', linkError);
          return NextResponse.json({ error: 'Failed to link user account' }, { status: 500 });
        }

        return NextResponse.json(linkedUser);
      }
    }

    // If still not found, create new user
    if (profileError) {
      const { data: newUser, error: createError } = await adminClient
        .from('users')
        .insert({
          id: authUser.id,
          auth_id: authUser.id,
          email: authUser.email?.toLowerCase() || '',
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          role: 'view',
          status: 'active',
          auth_linked: true,
          avatar_url: authUser.user_metadata?.avatar_url,
        })
        .select()
        .single();

      if (createError) {
        console.error('[API /auth/profile] Failed to create user:', createError);
        // Return default user object as fallback
        return NextResponse.json({
          id: authUser.id,
          auth_id: authUser.id,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          role: 'view',
          status: 'active',
          avatar_url: authUser.user_metadata?.avatar_url,
          created_at: authUser.created_at,
          updated_at: authUser.created_at,
        });
      }

      return NextResponse.json(newUser);
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('[API /auth/profile] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
