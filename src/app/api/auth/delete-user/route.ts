import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
  try {
    // Check for service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

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
      return NextResponse.json({ error: 'Only admins can delete users' }, { status: 403 });
    }

    // Get user ID to delete
    const { userId } = await request.json() as { userId: string };

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === authUser.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get the user to check if they're auth-linked
    const { data: userToDelete } = await adminClient
      .from('users')
      .select('id, email, auth_linked')
      .eq('id', userId)
      .single();

    if (!userToDelete) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete from users table first
    const { error: deleteError } = await adminClient
      .from('users')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      console.error('Failed to delete user from users table:', deleteError);
      return NextResponse.json({ error: `Failed to delete user: ${deleteError.message}` }, { status: 500 });
    }

    // If auth-linked, also delete from auth
    if (userToDelete.auth_linked) {
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.error('Failed to delete user from auth:', authDeleteError);
        // User is already deleted from users table, so just log this
      }
    }

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to delete user: ${errorMessage}` }, { status: 500 });
  }
}
