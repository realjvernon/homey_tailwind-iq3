'use strict';

import type { TailwindNotificationPayload } from './lib/TailwindClient';
import type { NotificationLogEntry } from './app';

interface NotificationHandlerArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  homey: any;
  body: TailwindNotificationPayload | null;
  query?: { host?: string };
}

interface LogHandlerArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  homey: any;
}

export async function receiveNotification({
  homey,
  body,
  query,
}: NotificationHandlerArgs): Promise<boolean> {
  if (!body || !body.result) {
    throw new Error('Invalid notification payload');
  }
  homey.app.handleNotification(body, query?.host);
  return true;
}

export async function getNotificationLog({
  homey,
}: LogHandlerArgs): Promise<NotificationLogEntry[]> {
  return homey.app.getNotificationLog();
}

module.exports = { receiveNotification, getNotificationLog };
