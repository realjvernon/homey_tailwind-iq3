'use strict';

import Homey from 'homey';
import type { TailwindNotificationPayload } from './lib/TailwindClient';

export interface NotificationLogEntry {
  payload: TailwindNotificationPayload;
  timestamp: string;
}

class TailwindApp extends Homey.App {
  private notificationLog: NotificationLogEntry[] = [];
  private readonly MAX_LOG_SIZE = 10;

  async onInit() {
    this.log('Tailwind app has been initialized');
  }

  handleNotification(payload: TailwindNotificationPayload, sourceHost?: string): void {
    this.log('Received notification:', payload.notify);

    this.notificationLog.push({
      payload,
      timestamp: new Date().toISOString(),
    });
    if (this.notificationLog.length > this.MAX_LOG_SIZE) {
      this.notificationLog.shift();
    }

    this.homey.emit('tailwind:notification', payload, sourceHost);
  }

  getNotificationLog(): NotificationLogEntry[] {
    return this.notificationLog;
  }
}

export default TailwindApp;
module.exports = TailwindApp;
