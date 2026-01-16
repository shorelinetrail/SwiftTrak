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

        const pendingUserId = pendingUser.id;
        const newUserId = authUser.id;

        // STEP 1: Query all items owned by the pending user BEFORE deleting
        // We need to store these IDs because ON DELETE SET NULL will wipe the references
        console.log('[API /auth/profile] Step 1: Querying items owned by pending user...');

        const [
          ownedActions,
          createdActions,
          submittedQueries,
          assignedQueries,
          createdUpdates,
          actionUpdates,
          threatUpdates,
          createdThreats,
          madeByDecisions,
          createdMilestones,
          actionAudits,
          threatAudits,
          decisionAudits,
          milestoneAudits,
          userNotifications,
          invitedUsers,
        ] = await Promise.all([
          adminClient.from('actions').select('id').eq('owner_id', pendingUserId),
          adminClient.from('actions').select('id').eq('created_by', pendingUserId),
          adminClient.from('technical_queries').select('id').eq('submitted_by', pendingUserId),
          adminClient.from('technical_queries').select('id').eq('assigned_to', pendingUserId),
          adminClient.from('updates').select('id').eq('created_by', pendingUserId),
          adminClient.from('action_updates').select('id').eq('user_id', pendingUserId),
          adminClient.from('threat_updates').select('id').eq('user_id', pendingUserId),
          adminClient.from('threats').select('id').eq('created_by', pendingUserId),
          adminClient.from('decisions').select('id').eq('made_by', pendingUserId),
          adminClient.from('milestones').select('id').eq('created_by', pendingUserId),
          adminClient.from('action_audit').select('id').eq('user_id', pendingUserId),
          adminClient.from('threat_audit').select('id').eq('user_id', pendingUserId),
          adminClient.from('decision_audit').select('id').eq('user_id', pendingUserId),
          adminClient.from('milestone_audit').select('id').eq('user_id', pendingUserId),
          adminClient.from('notifications').select('id').eq('user_id', pendingUserId),
          adminClient.from('users').select('id').eq('invited_by', pendingUserId),
        ]);

        const ownedActionIds = ownedActions.data?.map(a => a.id) || [];
        const createdActionIds = createdActions.data?.map(a => a.id) || [];
        console.log('[API /auth/profile] Found', ownedActionIds.length, 'owned actions:', ownedActionIds);
        console.log('[API /auth/profile] Found', createdActionIds.length, 'created actions');

        // STEP 2: Delete the pending user (this will SET NULL on FK references)
        console.log('[API /auth/profile] Step 2: Deleting pending user:', pendingUserId);
        const { error: deleteError } = await adminClient
          .from('users')
          .delete()
          .eq('id', pendingUserId);

        if (deleteError) {
          console.error('[API /auth/profile] Failed to delete pending user:', deleteError);
          return NextResponse.json({ error: 'Failed to link user account' }, { status: 500 });
        }
        console.log('[API /auth/profile] Pending user deleted successfully');

        // STEP 3: Create the new user with auth ID
        console.log('[API /auth/profile] Step 3: Creating new user with ID:', newUserId);
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

        if (insertError) {
          console.error('[API /auth/profile] Failed to create linked user:', insertError);
          return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 });
        }
        console.log('[API /auth/profile] New user created:', newUser.id);

        // STEP 4: Update all references using the stored IDs
        console.log('[API /auth/profile] Step 4: Updating references to new user...');

        const updatePromises = [];

        // Update owned actions
        if (ownedActionIds.length > 0) {
          updatePromises.push(
            adminClient.from('actions').update({ owner_id: newUserId }).in('id', ownedActionIds)
              .then(r => ({ name: 'actions.owner_id', ...r, count: ownedActionIds.length }))
          );
        }
        if (createdActionIds.length > 0) {
          updatePromises.push(
            adminClient.from('actions').update({ created_by: newUserId }).in('id', createdActionIds)
              .then(r => ({ name: 'actions.created_by', ...r, count: createdActionIds.length }))
          );
        }
        if (submittedQueries.data?.length) {
          updatePromises.push(
            adminClient.from('technical_queries').update({ submitted_by: newUserId }).in('id', submittedQueries.data.map(x => x.id))
              .then(r => ({ name: 'technical_queries.submitted_by', ...r }))
          );
        }
        if (assignedQueries.data?.length) {
          updatePromises.push(
            adminClient.from('technical_queries').update({ assigned_to: newUserId }).in('id', assignedQueries.data.map(x => x.id))
              .then(r => ({ name: 'technical_queries.assigned_to', ...r }))
          );
        }
        if (createdUpdates.data?.length) {
          updatePromises.push(
            adminClient.from('updates').update({ created_by: newUserId }).in('id', createdUpdates.data.map(x => x.id))
              .then(r => ({ name: 'updates.created_by', ...r }))
          );
        }
        if (actionUpdates.data?.length) {
          updatePromises.push(
            adminClient.from('action_updates').update({ user_id: newUserId }).in('id', actionUpdates.data.map(x => x.id))
              .then(r => ({ name: 'action_updates.user_id', ...r }))
          );
        }
        if (threatUpdates.data?.length) {
          updatePromises.push(
            adminClient.from('threat_updates').update({ user_id: newUserId }).in('id', threatUpdates.data.map(x => x.id))
              .then(r => ({ name: 'threat_updates.user_id', ...r }))
          );
        }
        if (createdThreats.data?.length) {
          updatePromises.push(
            adminClient.from('threats').update({ created_by: newUserId }).in('id', createdThreats.data.map(x => x.id))
              .then(r => ({ name: 'threats.created_by', ...r }))
          );
        }
        if (madeByDecisions.data?.length) {
          updatePromises.push(
            adminClient.from('decisions').update({ made_by: newUserId }).in('id', madeByDecisions.data.map(x => x.id))
              .then(r => ({ name: 'decisions.made_by', ...r }))
          );
        }
        if (createdMilestones.data?.length) {
          updatePromises.push(
            adminClient.from('milestones').update({ created_by: newUserId }).in('id', createdMilestones.data.map(x => x.id))
              .then(r => ({ name: 'milestones.created_by', ...r }))
          );
        }
        if (actionAudits.data?.length) {
          updatePromises.push(
            adminClient.from('action_audit').update({ user_id: newUserId }).in('id', actionAudits.data.map(x => x.id))
              .then(r => ({ name: 'action_audit.user_id', ...r }))
          );
        }
        if (threatAudits.data?.length) {
          updatePromises.push(
            adminClient.from('threat_audit').update({ user_id: newUserId }).in('id', threatAudits.data.map(x => x.id))
              .then(r => ({ name: 'threat_audit.user_id', ...r }))
          );
        }
        if (decisionAudits.data?.length) {
          updatePromises.push(
            adminClient.from('decision_audit').update({ user_id: newUserId }).in('id', decisionAudits.data.map(x => x.id))
              .then(r => ({ name: 'decision_audit.user_id', ...r }))
          );
        }
        if (milestoneAudits.data?.length) {
          updatePromises.push(
            adminClient.from('milestone_audit').update({ user_id: newUserId }).in('id', milestoneAudits.data.map(x => x.id))
              .then(r => ({ name: 'milestone_audit.user_id', ...r }))
          );
        }
        if (userNotifications.data?.length) {
          updatePromises.push(
            adminClient.from('notifications').update({ user_id: newUserId }).in('id', userNotifications.data.map(x => x.id))
              .then(r => ({ name: 'notifications.user_id', ...r }))
          );
        }
        if (invitedUsers.data?.length) {
          updatePromises.push(
            adminClient.from('users').update({ invited_by: newUserId }).in('id', invitedUsers.data.map(x => x.id))
              .then(r => ({ name: 'users.invited_by', ...r }))
          );
        }

        const updateResults = await Promise.allSettled(updatePromises);

        console.log('[API /auth/profile] === UPDATE RESULTS ===');
        updateResults.forEach((result) => {
          if (result.status === 'rejected') {
            console.error(`[API /auth/profile] Update REJECTED:`, result.reason);
          } else if (result.value.error) {
            console.error(`[API /auth/profile] ${result.value.name}: ERROR -`, result.value.error.message);
          } else {
            console.log(`[API /auth/profile] ${result.value.name}: OK`);
          }
        });

        console.log('[API /auth/profile] === LINKING COMPLETE ===');
        return NextResponse.json(newUser);
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
