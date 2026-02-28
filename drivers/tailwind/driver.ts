import Homey from 'homey';
import { TailwindClient, TailwindStatusResponse } from '../../lib/TailwindClient';
import type TailwindDevice from './device';

type PairingDevice = {
  name: string;
  data: { id: string };
  store: {
    controllerHost: string;
    localKey: string;
    doorIndex: number;
    discoveryId: string | null;
  };
};

type ControllerInfo = {
  name: string;
  host: string;
  discoveryId: string;
};

export default class TailwindDriver extends Homey.Driver {
  async onInit() {
    this.log('TailwindDriver has been initialized');

    // Condition card: garage door is open
    const conditionIsOpen = this.homey.flow.getConditionCard('garage_door_is_open');
    conditionIsOpen.registerRunListener(async (args: { device: TailwindDevice }) => {
      return !args.device.getCapabilityValue('garagedoor_closed');
    });

    // Action card: open garage door
    const actionOpen = this.homey.flow.getActionCard('open_garage_door');
    actionOpen.registerRunListener(async (args: { device: TailwindDevice }) => {
      await args.device.onCapabilityGarageDoorClosed(false);
    });

    // Action card: close garage door
    const actionClose = this.homey.flow.getActionCard('close_garage_door');
    actionClose.registerRunListener(async (args: { device: TailwindDevice }) => {
      await args.device.onCapabilityGarageDoorClosed(true);
    });
  }

  async onPair(session: Homey.Driver.PairSession) {
    let discoveredDevices: PairingDevice[] = [];
    let savedCredentials: {
      host: string;
      localKey: string;
      discoveryId?: string;
    } | null = null;

    // Step 1: Return controllers from Homey's built-in discovery cache (instant).
    session.setHandler('discover_controllers', async (): Promise<ControllerInfo[]> => {
      this.log('discover_controllers: reading Homey discovery cache');
      const strategy = this.getDiscoveryStrategy();
      const results = strategy.getDiscoveryResults();
      const controllers: ControllerInfo[] = [];

      for (const result of Object.values(results)) {
        const address = (result as { address?: string }).address;
        const id = (result as { id?: string }).id ?? '';
        const txt = (result as { txt?: Record<string, string> }).txt ?? {};
        const hostname = (result as { host?: string }).host ?? null;
        const product = txt.product ?? '';
        const host = hostname ? hostname.replace(/\.local\.?$/, '') + '.local' : address;

        if (!host) continue;

        const displayName = hostname?.replace(/\.local\.?$/, '') ?? address ?? id;
        this.log(
          `discover_controllers: found ${displayName} at ${host} (product=${product}, id=${id})`,
        );
        controllers.push({
          name: displayName,
          host,
          discoveryId: id,
        });
      }

      this.log(`discover_controllers: ${controllers.length} controller(s) from cache`);
      return controllers;
    });

    // Step 2: Front-end saves credentials as user fills in the form.
    session.setHandler(
      'save_credentials',
      async (data: { host: string; localKey: string; discoveryId?: string }) => {
        savedCredentials = data;
        this.log(`save_credentials: host=${data.host}`);
      },
    );

    // Step 3: When SDK "Next" button navigates to list_devices, authenticate
    // and build the door list.
    session.setHandler('list_devices', async () => {
      if (!savedCredentials || !savedCredentials.host || !savedCredentials.localKey) {
        throw new Error('Please select a controller and enter your Local Control Key.');
      }

      this.log(`list_devices: authenticating host=${savedCredentials.host}`);
      const data = savedCredentials;
      const client = new TailwindClient(data.localKey);
      let status: TailwindStatusResponse;
      try {
        status = await client.getDeviceStatus(data.host);
      } catch (error) {
        this.error('list_devices: authenticate failed:', error);
        throw new Error('Could not connect. Check IP address and Local Control Key.');
      }

      if (status.result !== 'OK') {
        throw new Error('Controller returned an error. Check your Local Control Key.');
      }

      const doorCount = status.door_num ?? 0;
      const devId = status.dev_id ?? data.host;
      discoveredDevices = [];

      for (let i = 1; i <= doorCount; i++) {
        const doorKey = `door${i}` as 'door1' | 'door2' | 'door3';
        const doorData = status.data?.[doorKey];
        if (doorData && !doorData.disabled) {
          discoveredDevices.push({
            name: `Garage Door ${i}`,
            data: { id: `${devId}_door${i}` },
            store: {
              controllerHost: data.host,
              localKey: data.localKey,
              doorIndex: doorData.index,
              discoveryId: data.discoveryId ?? null,
            },
          });
        }
      }

      if (discoveredDevices.length === 0) {
        throw new Error('No enabled doors found on this controller.');
      }

      this.log(`list_devices: returning ${discoveredDevices.length} device(s)`);
      return discoveredDevices;
    });
  }
}

module.exports = TailwindDriver;
