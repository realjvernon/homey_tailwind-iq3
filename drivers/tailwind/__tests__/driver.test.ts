import TailwindDriver from '../driver';
import { TailwindClient } from '../../../lib/TailwindClient';
import type { Driver } from 'homey';

jest.mock('../../../lib/TailwindClient');

// Mock discovery strategy
const mockDiscoveryResults: Record<string, unknown> = {};
const mockDiscoveryStrategy = {
  getDiscoveryResults: jest.fn(() => mockDiscoveryResults),
};

interface MockSession {
  nextView: jest.Mock;
  showView: jest.Mock;
  setHandler: jest.Mock;
  emit: jest.Mock;
}

describe('TailwindDriver', () => {
  let driver: TailwindDriver;
  let session: MockSession;
  let handlers: Record<string, Function>;
  let mockConditionListener: jest.Mock;
  let mockOpenActionListener: jest.Mock;
  let mockCloseActionListener: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset discovery results
    Object.keys(mockDiscoveryResults).forEach((k) => delete mockDiscoveryResults[k]);

    mockConditionListener = jest.fn();
    mockOpenActionListener = jest.fn();
    mockCloseActionListener = jest.fn();

    driver = new TailwindDriver();
    (driver as any).homey = {
      settings: { get: jest.fn(), set: jest.fn() },
      flow: {
        getConditionCard: jest.fn().mockReturnValue({
          registerRunListener: mockConditionListener,
        }),
        getActionCard: jest.fn().mockImplementation((id: string) => {
          const cards: Record<string, { registerRunListener: jest.Mock }> = {
            open_garage_door: { registerRunListener: mockOpenActionListener },
            close_garage_door: { registerRunListener: mockCloseActionListener },
          };
          return cards[id];
        }),
      },
    };
    (driver as any).log = jest.fn();
    (driver as any).error = jest.fn();
    (driver as any).getDiscoveryStrategy = jest.fn(() => mockDiscoveryStrategy);

    handlers = {};
    session = {
      nextView: jest.fn(),
      showView: jest.fn(),
      setHandler: jest.fn().mockImplementation((name: string, handler: Function) => {
        handlers[name] = handler;
      }),
      emit: jest.fn(),
    };
    driver.onPair(session as unknown as Driver.PairSession);
  });

  describe('onPair', () => {
    it('should register discover_controllers, save_credentials, and list_devices handlers', () => {
      expect(handlers['discover_controllers']).toBeDefined();
      expect(handlers['save_credentials']).toBeDefined();
      expect(handlers['list_devices']).toBeDefined();
    });

    describe('discover_controllers', () => {
      it('should return controllers from Homey discovery cache', async () => {
        Object.assign(mockDiscoveryResults, {
          'TW-WebServer': {
            id: 'TW-WebServer',
            address: '192.168.1.200',
            host: 'tailwind-abc123.local',
            txt: { vendor: 'tailwind', product: 'iq3' },
          },
        });

        const result = await handlers['discover_controllers']();

        expect(result).toEqual([
          {
            name: 'tailwind-abc123',
            host: 'tailwind-abc123.local',
            discoveryId: 'TW-WebServer',
          },
        ]);
      });

      it('should return empty array when no controllers in cache', async () => {
        const result = await handlers['discover_controllers']();
        expect(result).toEqual([]);
      });

      it('should skip discovery entries without address or host', async () => {
        Object.assign(mockDiscoveryResults, {
          'TW-nothing': {
            id: 'TW-nothing',
            txt: {},
          },
          'TW-with-address': {
            id: 'TW-with-address',
            address: '192.168.1.50',
            host: 'good-host.local',
            txt: {},
          },
        });

        const result = await handlers['discover_controllers']();
        expect(result).toHaveLength(1);
        expect(result[0].host).toBe('good-host.local');
      });

      it('should use IP address as host when mDNS host is missing', async () => {
        Object.assign(mockDiscoveryResults, {
          'TW-no-host': {
            id: 'TW-no-host',
            address: '192.168.1.75',
            txt: {},
          },
        });

        const result = await handlers['discover_controllers']();
        expect(result[0].name).toBe('192.168.1.75');
        expect(result[0].host).toBe('192.168.1.75');
      });

      it('should handle multiple controllers', async () => {
        Object.assign(mockDiscoveryResults, {
          'TW-WebServer-1': {
            id: 'TW-WebServer-1',
            address: '192.168.1.200',
            host: 'tailwind-abc123.local',
            txt: { vendor: 'tailwind', product: 'iq3' },
          },
          'TW-WebServer-2': {
            id: 'TW-WebServer-2',
            address: '192.168.1.201',
            host: 'tailwind-def456.local',
            txt: { vendor: 'tailwind', product: 'iq3' },
          },
        });

        const result = await handlers['discover_controllers']();
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual(
          expect.objectContaining({ host: 'tailwind-abc123.local', discoveryId: 'TW-WebServer-1' }),
        );
        expect(result[1]).toEqual(
          expect.objectContaining({ host: 'tailwind-def456.local', discoveryId: 'TW-WebServer-2' }),
        );
      });
    });

    describe('save_credentials', () => {
      it('should store credentials for later use by list_devices', async () => {
        await handlers['save_credentials']({
          host: '192.168.1.100',
          localKey: '869769',
        });

        // Credentials are stored; verify by calling list_devices (which uses them)
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'OK',
                dev_id: '_test_id_',
                door_num: 1,
                data: {
                  door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
                },
              }),
            }) as unknown as TailwindClient,
        );

        const devices = await handlers['list_devices']();
        expect(devices).toHaveLength(1);
      });
    });

    describe('list_devices', () => {
      it('should authenticate and return one device per enabled door', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'OK',
                dev_id: '_test_id_',
                door_num: 2,
                data: {
                  door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
                  door2: { index: 1, status: 'open', lockup: 0, disabled: 0 },
                },
              }),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({ host: '192.168.1.100', localKey: '869769' });
        const devices = await handlers['list_devices']();

        expect(devices).toHaveLength(2);
        expect(devices[0]).toEqual({
          name: 'Garage Door 1',
          data: { id: '_test_id__door1' },
          store: {
            controllerHost: '192.168.1.100',
            localKey: '869769',
            doorIndex: 0,
            discoveryId: null,
          },
        });
      });

      it('should use host for connection', async () => {
        const mockGetDeviceStatus = jest.fn().mockResolvedValue({
          result: 'OK',
          dev_id: '_test_id_',
          door_num: 1,
          data: {
            door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
          },
        });

        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: mockGetDeviceStatus,
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({
          host: 'tailwind-abc.local',
          localKey: '869769',
        });
        await handlers['list_devices']();

        expect(mockGetDeviceStatus).toHaveBeenCalledWith('tailwind-abc.local');
      });

      it('should store discoveryId when provided', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'OK',
                dev_id: '_test_id_',
                door_num: 1,
                data: {
                  door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
                },
              }),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({
          host: 'tailwind-abc.local',
          localKey: '869769',
          discoveryId: 'TW-WebServer',
        });

        const devices = await handlers['list_devices']();
        expect(devices[0].store.controllerHost).toBe('tailwind-abc.local');
        expect(devices[0].store.discoveryId).toBe('TW-WebServer');
      });

      it('should skip disabled doors', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'OK',
                dev_id: '_test_id_',
                door_num: 2,
                data: {
                  door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
                  door2: { index: 1, status: 'close', lockup: 0, disabled: 1 },
                },
              }),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({ host: '192.168.1.100', localKey: '869769' });
        const devices = await handlers['list_devices']();

        expect(devices).toHaveLength(1);
        expect(devices[0].data.id).toBe('_test_id__door1');
      });

      it('should throw when connection fails', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockRejectedValue(new Error('Timeout')),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({ host: '192.168.1.100', localKey: 'bad-key' });
        await expect(handlers['list_devices']()).rejects.toThrow('Could not connect');
      });

      it('should throw when controller returns an error', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'Fail',
                info: 'Invalid token',
              }),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({ host: '192.168.1.100', localKey: '000000' });
        await expect(handlers['list_devices']()).rejects.toThrow('Controller returned an error');
      });

      it('should throw when no doors are found', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'OK',
                dev_id: '_test_id_',
                door_num: 0,
                data: {},
              }),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({ host: '192.168.1.100', localKey: '869769' });
        await expect(handlers['list_devices']()).rejects.toThrow('No enabled doors found');
      });

      it('should throw when called without credentials', async () => {
        await expect(handlers['list_devices']()).rejects.toThrow(
          'Please select a controller and enter your Local Control Key.',
        );
      });

      it('should fall back to host when dev_id is missing', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'OK',
                door_num: 1,
                data: {
                  door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
                },
              }),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({ host: '192.168.1.100', localKey: '869769' });
        const devices = await handlers['list_devices']();

        expect(devices[0].data.id).toBe('192.168.1.100_door1');
      });

      it('should handle three-door controller', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'OK',
                dev_id: '_test_id_',
                door_num: 3,
                data: {
                  door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
                  door2: { index: 1, status: 'open', lockup: 0, disabled: 0 },
                  door3: { index: 2, status: 'close', lockup: 0, disabled: 0 },
                },
              }),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({ host: '192.168.1.100', localKey: '869769' });
        const devices = await handlers['list_devices']();

        expect(devices).toHaveLength(3);
        expect(devices[2].name).toBe('Garage Door 3');
        expect(devices[2].store.doorIndex).toBe(2);
      });

      it('should throw when all doors are disabled', async () => {
        (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
          () =>
            ({
              getDeviceStatus: jest.fn().mockResolvedValue({
                result: 'OK',
                dev_id: '_test_id_',
                door_num: 2,
                data: {
                  door1: { index: 0, status: 'close', lockup: 0, disabled: 1 },
                  door2: { index: 1, status: 'close', lockup: 0, disabled: 1 },
                },
              }),
            }) as unknown as TailwindClient,
        );

        await handlers['save_credentials']({ host: '192.168.1.100', localKey: '869769' });
        await expect(handlers['list_devices']()).rejects.toThrow('No enabled doors found');
      });

      it('should throw when credentials have empty host', async () => {
        await handlers['save_credentials']({ host: '', localKey: '869769' });
        await expect(handlers['list_devices']()).rejects.toThrow(
          'Please select a controller and enter your Local Control Key.',
        );
      });

      it('should throw when credentials have empty localKey', async () => {
        await handlers['save_credentials']({ host: '192.168.1.100', localKey: '' });
        await expect(handlers['list_devices']()).rejects.toThrow(
          'Please select a controller and enter your Local Control Key.',
        );
      });
    });
  });

  describe('onInit', () => {
    it('should log initialization message', async () => {
      await driver.onInit();
      expect((driver as any).log).toHaveBeenCalledWith('TailwindDriver has been initialized');
    });
  });

  describe('flow cards', () => {
    it('should register condition card garage_door_is_open on init', async () => {
      await driver.onInit();

      expect((driver as any).homey.flow.getConditionCard).toHaveBeenCalledWith(
        'garage_door_is_open',
      );
      expect(mockConditionListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should register action card open_garage_door on init', async () => {
      await driver.onInit();

      expect((driver as any).homey.flow.getActionCard).toHaveBeenCalledWith('open_garage_door');
      expect(mockOpenActionListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should register action card close_garage_door on init', async () => {
      await driver.onInit();

      expect((driver as any).homey.flow.getActionCard).toHaveBeenCalledWith('close_garage_door');
      expect(mockCloseActionListener).toHaveBeenCalledWith(expect.any(Function));
    });

    describe('condition listener', () => {
      let conditionRunner: (args: { device: any }) => Promise<boolean> | boolean;

      beforeEach(async () => {
        await driver.onInit();
        conditionRunner = mockConditionListener.mock.calls[0][0];
      });

      it('should return true when door is open (garagedoor_closed is false)', async () => {
        const mockDevice = { getCapabilityValue: jest.fn().mockReturnValue(false) };
        const result = await conditionRunner({ device: mockDevice });

        expect(mockDevice.getCapabilityValue).toHaveBeenCalledWith('garagedoor_closed');
        expect(result).toBe(true);
      });

      it('should return false when door is closed (garagedoor_closed is true)', async () => {
        const mockDevice = { getCapabilityValue: jest.fn().mockReturnValue(true) };
        const result = await conditionRunner({ device: mockDevice });

        expect(result).toBe(false);
      });
    });

    describe('action listeners', () => {
      let openRunner: (args: { device: any }) => Promise<void> | void;
      let closeRunner: (args: { device: any }) => Promise<void> | void;

      beforeEach(async () => {
        await driver.onInit();
        openRunner = mockOpenActionListener.mock.calls[0][0];
        closeRunner = mockCloseActionListener.mock.calls[0][0];
      });

      it('should call onCapabilityGarageDoorClosed(false) for open action', async () => {
        const mockDevice = { onCapabilityGarageDoorClosed: jest.fn().mockResolvedValue(undefined) };
        await openRunner({ device: mockDevice });

        expect(mockDevice.onCapabilityGarageDoorClosed).toHaveBeenCalledWith(false);
      });

      it('should call onCapabilityGarageDoorClosed(true) for close action', async () => {
        const mockDevice = { onCapabilityGarageDoorClosed: jest.fn().mockResolvedValue(undefined) };
        await closeRunner({ device: mockDevice });

        expect(mockDevice.onCapabilityGarageDoorClosed).toHaveBeenCalledWith(true);
      });
    });
  });
});
