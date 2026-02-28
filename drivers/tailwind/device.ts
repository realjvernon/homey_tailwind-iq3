import Homey from 'homey';
import { TailwindClient } from '../../lib/TailwindClient';
import type { TailwindNotificationPayload } from '../../lib/TailwindClient';

type DoorKey = 'door1' | 'door2' | 'door3';

export default class TailwindDevice extends Homey.Device {
  private client: TailwindClient | null = null;
  private controllerHost = '';
  private doorIndex = 0;
  private localKey = '';
  private pollTimer: NodeJS.Timeout | null = null;
  private notificationHandler: ((payload: TailwindNotificationPayload) => void) | null = null;
  private readonly POLL_INTERVAL = 30000;
  private triggerOpened: Homey.FlowCardTriggerDevice | null = null;
  private triggerClosed: Homey.FlowCardTriggerDevice | null = null;
  private triggerLocked: Homey.FlowCardTriggerDevice | null = null;
  private triggerRebooted: Homey.FlowCardTriggerDevice | null = null;
  private lastKnownClosed: boolean | null = null;

  async onInit() {
    this.log('TailwindDevice has been initialized');

    const store = this.getStore();

    // Migration: old store used controllerIp + controllerHostname
    if (store.controllerHost) {
      this.controllerHost = store.controllerHost;
    } else {
      this.controllerHost = store.controllerHostname || store.controllerIp || '';
      await this.setStoreValue('controllerHost', this.controllerHost);
    }

    this.doorIndex = store.doorIndex;
    this.localKey = store.localKey;

    this.client = new TailwindClient(this.localKey);

    await this.setSettings({
      controllerHost: this.controllerHost,
      localKey: this.localKey,
    });

    this.registerCapabilityListener('garagedoor_closed', async (value: boolean) => {
      await this.onCapabilityGarageDoorClosed(value);
    });

    // Register flow trigger cards
    this.triggerOpened = this.homey.flow.getDeviceTriggerCard('garage_door_opened');
    this.triggerClosed = this.homey.flow.getDeviceTriggerCard('garage_door_closed');
    this.triggerLocked = this.homey.flow.getDeviceTriggerCard('garage_door_locked');
    this.triggerRebooted = this.homey.flow.getDeviceTriggerCard('controller_rebooted');

    // Listen for push notifications from the controller
    this.notificationHandler = this.onNotification.bind(this);
    this.homey.on(
      'tailwind:notification',
      this.notificationHandler as (...args: unknown[]) => void,
    );

    // Register for push notifications (fire-and-forget)
    this.registerNotifications().catch((err: Error) => {
      this.error('Failed to register notifications:', err);
    });

    // Initial poll, then schedule recurring
    await this.pollDeviceStatus();
  }

  private async pollDeviceStatus() {
    try {
      if (!this.client) return;

      const response = await this.client.getDeviceStatus(this.controllerHost);

      if (response.data) {
        const doorKey: DoorKey = `door${this.doorIndex + 1}` as DoorKey;
        const doorData = response.data[doorKey];
        if (doorData) {
          const isClosed = doorData.status === 'close';
          await this.setCapabilityValue('garagedoor_closed', isClosed);

          // Fire trigger on state change detected by polling
          if (this.lastKnownClosed !== null && this.lastKnownClosed !== isClosed) {
            if (isClosed) {
              this.triggerClosed?.trigger(this, {}, {}).catch(this.error.bind(this));
            } else {
              this.triggerOpened?.trigger(this, {}, {}).catch(this.error.bind(this));
            }
          }
          this.lastKnownClosed = isClosed;
        }
      }

      await this.setAvailable();

      // Re-register notify_url on every successful poll to catch IP changes,
      // silent deregistration, and failed init registration
      this.registerNotifications().catch((err: Error) => {
        this.error('Failed to re-register notifications:', err);
      });
    } catch (error) {
      this.error('Failed to poll device status:', error);
      await this.setUnavailable('Cannot reach controller').catch(() => {});
    } finally {
      this.pollTimer = this.homey.setTimeout(() => {
        this.pollDeviceStatus().catch(this.error.bind(this));
      }, this.POLL_INTERVAL);
    }
  }

  private async registerNotifications(): Promise<void> {
    if (!this.client) return;
    const localUrl = await this.homey.api.getLocalUrl();
    const callbackUrl = `${localUrl}/api/app/com.dn.tailwind/notification?host=${encodeURIComponent(this.controllerHost)}`;
    await this.client.registerNotifyUrl(this.controllerHost, callbackUrl);
    this.log(`Registered notify_url: ${callbackUrl}`);
  }

  private onNotification(payload: TailwindNotificationPayload, sourceHost?: string): void {
    // Match by controller host (embedded in callback URL query param)
    if (sourceHost && sourceHost !== this.controllerHost) return;

    // Update door status from the full status data
    if (payload.data) {
      const doorKey: DoorKey = `door${this.doorIndex + 1}` as DoorKey;
      const doorData = payload.data[doorKey];
      if (doorData) {
        const isClosed = doorData.status === 'close';
        this.setCapabilityValue('garagedoor_closed', isClosed).catch(this.error.bind(this));
        this.lastKnownClosed = isClosed;
      }
    }

    // Fire flow trigger cards based on event type
    if (payload.notify) {
      if (payload.notify.door_idx === this.doorIndex) {
        switch (payload.notify.event) {
          case 'open':
            this.triggerOpened?.trigger(this, {}, {}).catch(this.error.bind(this));
            break;
          case 'close':
            this.triggerClosed?.trigger(this, {}, {}).catch(this.error.bind(this));
            break;
          case 'lock':
            this.triggerLocked?.trigger(this, {}, {}).catch(this.error.bind(this));
            break;
        }
      }

      if (payload.notify.event === 'reboot') {
        this.triggerRebooted?.trigger(this, {}, {}).catch(this.error.bind(this));
      }
    }

    // Re-register on controller reboot
    if (payload.notify?.event === 'reboot') {
      this.registerNotifications().catch((err: Error) => {
        this.error('Failed to re-register notifications after reboot:', err);
      });
    }
  }

  async onCapabilityGarageDoorClosed(value: boolean): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    const cmd = value ? 'close' : 'open';
    await this.client.controlDoor(this.controllerHost, this.doorIndex, cmd);
  }

  private static readonly VALID_HOST_RE = /^[a-zA-Z0-9._-]+$/;
  private static readonly VALID_KEY_RE = /^\d{6}$/;

  async onSettings({
    newSettings,
    changedKeys,
  }: {
    oldSettings: Record<string, unknown>;
    newSettings: Record<string, unknown>;
    changedKeys: string[];
  }): Promise<string | void> {
    const newHost = changedKeys.includes('controllerHost')
      ? (newSettings.controllerHost as string)
      : this.controllerHost;
    const newKey = changedKeys.includes('localKey')
      ? (newSettings.localKey as string)
      : this.localKey;

    if (changedKeys.includes('controllerHost')) {
      if (!newHost || newHost.length > 253 || !TailwindDevice.VALID_HOST_RE.test(newHost)) {
        throw new Error('Invalid controller host');
      }
    }

    if (changedKeys.includes('localKey')) {
      if (!TailwindDevice.VALID_KEY_RE.test(newKey)) {
        throw new Error('Invalid local key: must be exactly 6 digits');
      }
    }

    // Create test client with potentially new key
    const testClient = changedKeys.includes('localKey') ? new TailwindClient(newKey) : this.client;

    // Validate connection with new settings
    try {
      await testClient!.getDeviceStatus(newHost);
    } catch {
      throw new Error('Could not connect to controller with new settings');
    }

    // Apply changes only after successful validation
    if (changedKeys.includes('controllerHost')) {
      this.controllerHost = newHost;
      await this.setStoreValue('controllerHost', this.controllerHost);
    }
    if (changedKeys.includes('localKey')) {
      this.localKey = newKey;
      await this.setStoreValue('localKey', this.localKey);
      this.client = new TailwindClient(this.localKey);
    }

    // Re-register notify_url with potentially new host/key
    this.registerNotifications().catch((err: Error) => {
      this.error('Failed to re-register notifications after settings change:', err);
    });

    return 'Settings saved. Connection verified.';
  }

  // --- Homey Discovery lifecycle ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDiscoveryResult(discoveryResult: any): boolean {
    const store = this.getStore();
    const discoveryId = store.discoveryId;
    if (discoveryId && discoveryResult.id === discoveryId) {
      return true;
    }
    // Fallback: match by hostname
    const host = store.controllerHost;
    const resultHost = discoveryResult.host?.replace(/\.local\.?$/, '') + '.local';
    return !!(host && host === resultHost);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async onDiscoveryAvailable(discoveryResult: any): Promise<void> {
    this.log(`Discovery: controller available at ${discoveryResult.address}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async onDiscoveryLastSeenChanged(discoveryResult: any): Promise<void> {
    this.log(`Discovery: last seen changed, address=${discoveryResult.address}`);
  }

  async onDeleted() {
    this.log('TailwindDevice has been deleted');
    if (this.notificationHandler) {
      (this.homey as unknown as NodeJS.EventEmitter).removeListener(
        'tailwind:notification',
        this.notificationHandler,
      );
      this.notificationHandler = null;
    }
    if (this.pollTimer) {
      this.homey.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.client = null;
    this.triggerOpened = null;
    this.triggerClosed = null;
    this.triggerLocked = null;
    this.triggerRebooted = null;
  }
}

module.exports = TailwindDevice;
