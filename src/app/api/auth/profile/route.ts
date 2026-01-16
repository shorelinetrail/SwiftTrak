import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    // Get the authenticated user from session
    const supabase = await createClient();
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    console.log('[API /auth/profile] === START PROFILE FETCH ===');
    console.log('[API /auth/profile] Auth user:', authUser?.id, authUser?.email);

    if (authError || !authUser) {
      console.log('[API /auth/profile] Not authenticated:', authError);
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use admin client to bypass RLS and fetch profile
    const adminClient = createAdminClient();

    // First try to find by ID
    console.log('[API /auth/profile] Looking up user by auth ID:', authUser.id);
    let { data: profile, error: profileError } = await adminClient
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    console.log('[API /auth/profile] Lookup by ID result:', profile ? 'FOUND' : 'NOT FOUND', profileError?.message || '');

    // If not found by ID, try to find by email (for pending users who need linking)
    if (profileError && authUser.email) {
      console.log('[API /auth/profile] User not found by ID, searching by email:', authUser.email.toLowerCase());

      const { data: pendingUser, error: pendingError } = await adminClient
        .from('users')
        .select('*')
        .eq('email', authUser.email.toLowerCase())
        .single();

      console.log('[API /auth/profile] Lookup by email result:', pendingUser ? 'FOUND' : 'NOT FOUND', pendingError?.message || '');

      if (!pendingError && pendingUser) {
        console.log('[API /auth/profile] === LINKING PENDING USER ===');
        console.log('[API /auth/profile] Pending user details:', JSON.stringify({
          id: pendingUser.id,
          email: pendingUser.email,
          status: pendingUser.status,
          auth_linked: pendingUser.auth_linked,
          full_name: pendingUser.full_name,
        }));
        console.log('[API /auth/profile] Will update references from', pendingUser.id, 'to', authUser.id);

        // Update all references to the pending user ID BEFORE deleting
        // This ensures actions, queries, etc. remain assigned to the user
        const pendingUserId = pendingUser.id;
        const newUserId = authUser.id;

        // Update all foreign key references from pending user to new auth user
        // Run updates in parallel for efficiency
        const updateResults = await Promise.allSettled([
          // Actions
          adminClient.from('actions').update({ owner_id: newUserId }).eq('owner_id', pendingUserId),
          adminClient.from('actions').update({ created_by: newUserId }).eq('created_by', pendingUserId),

          // Technical queries
          adminClient.from('technical_queries').update({ submitted_by: newUserId }).eq('submitted_by', pendingUserId),
          adminClient.from('technical_queries').update({ assigned_to: newUserId }).eq('assigned_to', pendingUserId),

          // Updates table (column is created_by, not user_id)
          adminClient.from('updates').update({ created_by: newUserId }).eq('created_by', pendingUserId),

          // Action updates
          adminClient.from('action_updates').update({ user_id: newUserId }).eq('user_id', pendingUserId),

          // Threat updates
          adminClient.from('threat_updates').update({ user_id: newUserId }).eq('user_id', pendingUserId),

          // Threats
          adminClient.from('threats').update({ created_by: newUserId }).eq('created_by', pendingUserId),

          // Decisions (has both created_by and made_by)
          adminClient.from('decisions').update({ created_by: newUserId }).eq('created_by', pendingUserId),
          adminClient.from('decisions').update({ made_by: newUserId }).eq('made_by', pendingUserId),

          // Milestones
          adminClient.from('milestones').update({ created_by: newUserId }).eq('created_by', pendingUserId),

          // Audit tables
          adminClient.from('action_audit').update({ user_id: newUserId }).eq('user_id', pendingUserId),
          adminClient.from('threat_audit').update({ user_id: newUserId }).eq('user_id', pendingUserId),
          adminClient.from('decision_audit').update({ user_id: newUserId }).eq('user_id', pendingUserId),
          adminClient.from('milestone_audit').update({ user_id: newUserId }).eq('user_id', pendingUserId),

          // Notifications
          adminClient.from('notifications').update({ user_id: newUserId }).eq('user_id', pendingUserId),

          // Update any users invited by the pending user
          adminClient.from('users').update({ invited_by: newUserId }).eq('invited_by', pendingUserId),
        ]);

        // Log detailed results for each update
        const updateNames = [
          'actions.owner_id', 'actions.created_by',
          'technical_queries.submitted_by', 'technical_queries.assigned_to',
          'updates.created_by', 'action_updates.user_id', 'threat_updates.user_id',
          'threats.created_by', 'decisions.created_by', 'decisions.made_by',
          'milestones.created_by', 'action_audit.user_id', 'threat_audit.user_id',
          'decision_audit.user_id', 'milestone_audit.user_id',
          'notifications.user_id', 'users.invited_by'
        ];

        console.log('[API /auth/profile] === UPDATE RESULTS ===');
        updateResults.forEach((result, index) => {
          const name = updateNames[index] || `update_${index}`;
          if (result.status === 'rejected') {
            console.error(`[API /auth/profile] ${name}: REJECTED -`, result.reason);
          } else if (result.value.error) {
            console.error(`[API /auth/profile] ${name}: ERROR -`, result.value.error.message);
          } else {
            console.log(`[API /auth/profile] ${name}: OK (count: ${result.value.count ?? 'unknown'})`);
          }
        });

        const failures = updateResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
        console.log('[API /auth/profile] Total failures:', failures.length);

        // Now delete the old pending record
        console.log('[API /auth/profile] Deleting pending user:', pendingUserId);
        const { error: deleteError } = await adminClient
          .from('users')
          .delete()
          .eq('id', pendingUserId);

        if (deleteError) {
          console.error('[API /auth/profile] Failed to delete pending user:', deleteError);
        } else {
          console.log('[API /auth/profile] Pending user deleted successfully');
        }

        // Create new user with correct ID and data from pending user
        console.log('[API /auth/profile] Creating new user with ID:', newUserId);
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
          console.log('[API /auth/profile] === LINKING COMPLETE ===');
          console.log('[API /auth/profile] New user created:', newUser.id);
          return NextResponse.json(newUser);
        } else {
          console.error('[API /auth/profile] Failed to create linked user:', insertError);
        }
      } else {
        console.log('[API /auth/profile] No pending user found by email');
      }
    } else {
      console.log('[API /auth/profile] User found by ID, no linking needed');
    }

    if (profileError) {
      console.log('[API /auth/profile] Profile error exists, creating new user');

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

    console.log('[API /auth/profile] === RETURNING EXISTING PROFILE ===');
    console.log('[API /auth/profile] User ID:', profile?.id, 'Status:', profile?.status);
    return NextResponse.json(profile);
  } catch (error) {
    console.error('[API /auth/profile] === UNCAUGHT ERROR ===', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
