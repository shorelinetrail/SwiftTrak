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
        console.log('[API /auth/profile] Pending user ID:', pendingUser.id, '-> Auth user ID:', authUser.id);

        // Update all references to the pending user ID BEFORE deleting
        // This ensures actions, queries, etc. remain assigned to the user
        const pendingUserId = pendingUser.id;
        const newUserId = authUser.id;

        // Update actions owner_id
        const { error: actionsError } = await adminClient
          .from('actions')
          .update({ owner_id: newUserId })
          .eq('owner_id', pendingUserId);
        if (actionsError) {
          console.error('[API /auth/profile] Failed to update actions:', actionsError);
        } else {
          console.log('[API /auth/profile] Updated actions owner references');
        }

        // Update technical_queries assigned_to
        const { error: queriesError } = await adminClient
          .from('technical_queries')
          .update({ assigned_to: newUserId })
          .eq('assigned_to', pendingUserId);
        if (queriesError) {
          console.error('[API /auth/profile] Failed to update technical_queries:', queriesError);
        }

        // Update action_audit user_id
        const { error: auditError } = await adminClient
          .from('action_audit')
          .update({ user_id: newUserId })
          .eq('user_id', pendingUserId);
        if (auditError) {
          console.error('[API /auth/profile] Failed to update action_audit:', auditError);
        }

        // Update updates user_id
        const { error: updatesError } = await adminClient
          .from('updates')
          .update({ user_id: newUserId })
          .eq('user_id', pendingUserId);
        if (updatesError) {
          console.error('[API /auth/profile] Failed to update updates:', updatesError);
        }

        // Update notifications user_id
        const { error: notificationsError } = await adminClient
          .from('notifications')
          .update({ user_id: newUserId })
          .eq('user_id', pendingUserId);
        if (notificationsError) {
          console.error('[API /auth/profile] Failed to update notifications:', notificationsError);
        }

        // Update decisions created_by
        const { error: decisionsError } = await adminClient
          .from('decisions')
          .update({ created_by: newUserId })
          .eq('created_by', pendingUserId);
        if (decisionsError) {
          console.error('[API /auth/profile] Failed to update decisions:', decisionsError);
        }

        // Update threats created_by
        const { error: threatsError } = await adminClient
          .from('threats')
          .update({ created_by: newUserId })
          .eq('created_by', pendingUserId);
        if (threatsError) {
          console.error('[API /auth/profile] Failed to update threats:', threatsError);
        }

        // Update milestones created_by
        const { error: milestonesError } = await adminClient
          .from('milestones')
          .update({ created_by: newUserId })
          .eq('created_by', pendingUserId);
        if (milestonesError) {
          console.error('[API /auth/profile] Failed to update milestones:', milestonesError);
        }

        // Now delete the old pending record
        const { error: deleteError } = await adminClient
          .from('users')
          .delete()
          .eq('id', pendingUserId);

        if (deleteError) {
          console.error('[API /auth/profile] Failed to delete pending user:', deleteError);
        }

        // Create new user with correct ID and data from pending user
        const { data: newUser, error: insertError } = await adminClient
          .from('users')
          .insert({
            id: newUserId,
            email: pendingUser.email,
            full_name: authUser.user_metadata?.full_name || pendingUser.full_name,
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

      // User doesn't exist in database - create them
      console.log('[API /auth/profile] Creating new user record for:', authUser.id);

      const { data: newUser, error: createError } = await adminClient
        .from('users')
        .insert({
          id: authUser.id,
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
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          role: 'view',
          status: 'active',
          avatar_url: authUser.user_metadata?.avatar_url,
          created_at: authUser.created_at,
          updated_at: authUser.created_at,
        });
      }

      console.log('[API /auth/profile] User created successfully:', newUser.id);
      return NextResponse.json(newUser);
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('[API /auth/profile] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
