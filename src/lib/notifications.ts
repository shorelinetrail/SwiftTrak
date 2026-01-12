import { createClient } from '@/lib/supabase/client';

export type NotificationType =
  | 'action_assigned'
  | 'action_updated'
  | 'action_completed'
  | 'threat_created'
  | 'threat_escalated'
  | 'query_assigned'
  | 'query_response'
  | 'milestone_approaching'
  | 'milestone_completed'
  | 'decision_made'
  | 'mention';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  entityType,
  entityId,
}: CreateNotificationParams): Promise<void> {
  const supabase = createClient();

  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      entity_type: entityType,
      entity_id: entityId,
      read: false,
    });

    if (error) {
      console.error('Failed to create notification:', error);
    }
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}

// Helper functions for common notification types

export async function notifyActionAssigned(
  assigneeId: string,
  actionId: string,
  actionTitle: string,
  assignedBy: string
): Promise<void> {
  await createNotification({
    userId: assigneeId,
    type: 'action_assigned',
    title: 'Action Assigned',
    message: `"${actionTitle}" has been assigned to you by ${assignedBy}`,
    entityType: 'action',
    entityId: actionId,
  });
}

export async function notifyActionCompleted(
  creatorId: string,
  actionId: string,
  actionTitle: string,
  completedBy: string
): Promise<void> {
  await createNotification({
    userId: creatorId,
    type: 'action_completed',
    title: 'Action Completed',
    message: `"${actionTitle}" has been marked complete by ${completedBy}`,
    entityType: 'action',
    entityId: actionId,
  });
}

export async function notifyQueryAssigned(
  assigneeId: string,
  queryId: string,
  queryTitle: string,
  submittedBy: string
): Promise<void> {
  await createNotification({
    userId: assigneeId,
    type: 'query_assigned',
    title: 'Query Assigned',
    message: `"${queryTitle}" has been assigned to you by ${submittedBy}`,
    entityType: 'query',
    entityId: queryId,
  });
}

export async function notifyQueryResponse(
  submitterId: string,
  queryId: string,
  queryTitle: string,
  respondedBy: string
): Promise<void> {
  await createNotification({
    userId: submitterId,
    type: 'query_response',
    title: 'Query Response',
    message: `Your query "${queryTitle}" has been answered by ${respondedBy}`,
    entityType: 'query',
    entityId: queryId,
  });
}

export async function notifyThreatEscalated(
  userId: string,
  threatId: string,
  threatTitle: string,
  newRisk: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'threat_escalated',
    title: 'Threat Escalated',
    message: `"${threatTitle}" risk level has been escalated to ${newRisk}`,
    entityType: 'threat',
    entityId: threatId,
  });
}

export async function notifyMilestoneApproaching(
  userId: string,
  milestoneId: string,
  milestoneTitle: string,
  daysRemaining: number
): Promise<void> {
  await createNotification({
    userId,
    type: 'milestone_approaching',
    title: 'Milestone Approaching',
    message: `"${milestoneTitle}" is due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
    entityType: 'milestone',
    entityId: milestoneId,
  });
}

export async function notifyMention(
  mentionedUserId: string,
  entityType: string,
  entityId: string,
  entityTitle: string,
  mentionedBy: string
): Promise<void> {
  await createNotification({
    userId: mentionedUserId,
    type: 'mention',
    title: 'You were mentioned',
    message: `${mentionedBy} mentioned you in "${entityTitle}"`,
    entityType,
    entityId,
  });
}
