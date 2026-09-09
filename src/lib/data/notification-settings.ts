import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings, type NotificationType } from '@/lib/types';
import { prisma } from '@/lib/db/prisma';

/** Merges a user's stored overrides onto the defaults so every type always has a value. */
export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const rows = await prisma.notificationSetting.findMany({ where: { userId } });
  const settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
  for (const row of rows) {
    settings[row.type as NotificationType] = row.enabled;
  }
  return settings;
}
