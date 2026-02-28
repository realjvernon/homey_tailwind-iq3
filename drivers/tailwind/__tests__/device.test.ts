import { EventEmitter } from 'events';
import TailwindDevice from '../device';
import { TailwindClient } from '../../../lib/TailwindClient';

jest.mock('../../../lib/TailwindClient');
jest.useFakeTimers();

describe('TailwindDevice', () => {
  let device: TailwindDevice;
  let mockGetDeviceStatus: jest.Mock;
  let mockControlDoor: jest.Mock;
  let mockRegisterNotifyUrl: jest.Mock;
  let homeyEmitter: EventEmitter;
  let mockTriggerOpened: { trigger: jest.Mock };
  let mockTriggerClosed: { trigger: jest.Mock };
  let mockTriggerLocked: { trigger: jest.Mock };
  let mockTriggerRebooted: { trigger: jest.Mock };

  const mockStore = {
    controllerHost: 'tailwind-abc123.local',
    doorIndex: 0,
    localKey: '869769',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    homeyEmitter = new EventEmitter();

    mockTriggerOpened = { trigger: jest.fn().mockResolvedValue(undefined) };
    mockTriggerClosed = { trigger: jest.fn().mockResolvedValue(undefined) };
    mockTriggerLocked = { trigger: jest.fn().mockResolvedValue(undefined) };
    mockTriggerRebooted = { trigger: jest.fn().mockResolvedValue(undefined) };

    mockGetDeviceStatus = jest.fn().mockResolvedValue({
      result: 'OK',
      data: {
        door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
      },
    });
    mockControlDoor = jest.fn().mockResolvedValue({ result: 'OK' });
    mockRegisterNotifyUrl = jest.fn().mockResolvedValue({ result: 'OK' });

    (TailwindClient as jest.MockedClass<typeof TailwindClient>).mockImplementation(
      () =>
        ({
          getDeviceStatus: mockGetDeviceStatus,
          controlDoor: mockControlDoor,
          registerNotifyUrl: mockRegisterNotifyUrl,
        }) as unknown as TailwindClient,
    );

    device = new TailwindDevice();
    (device as any).log = jest.fn();
    (device as any).error = jest.fn();
    (device as any).getStore = jest.fn().mockReturnValue(mockStore);
    (device as any).getData = jest.fn().mockReturnValue({ id: '_test_id__door1' });
    (device as any).setCapabilityValue = jest.fn().mockResolvedValue(undefined);
    (device as any).registerCapabilityListener = jest.fn().mockResolvedValue(undefined);
    (device as any).setAvailable = jest.fn().mockResolvedValue(undefined);
    (device as any).setUnavailable = jest.fn().mockResolvedValue(undefined);
    (device as any).setStoreValue = jest.fn().mockResolvedValue(undefined);
    (device as any).setSettings = jest.fn().mockResolvedValue(undefined);
    (device as any).homey = {
      setTimeout: jest
        .fn()
        .mockImplementation((fn: () => void, ms: number) => global.setTimeout(fn, ms)),
      clearTimeout: jest.fn().mockImplementation((id: NodeJS.Timeout) => global.clearTimeout(id)),
      on: jest.fn().mockImplementation((e: string, fn: (...args: any[]) => void) => {
        homeyEmitter.on(e, fn);
      }),
      removeListener: jest.fn().mockImplementation((e: string, fn: (...args: any[]) => void) => {
        homeyEmitter.removeListener(e, fn);
      }),
      api: { getLocalUrl: jest.fn().mockResolvedValue('http://192.168.1.50') },
      flow: {
        getDeviceTriggerCard: jest.fn().mockImplementation((id: string) => {
          const cards: Record<string, { trigger: jest.Mock }> = {
            garage_door_opened: mockTriggerOpened,
            garage_door_closed: mockTriggerClosed,
            garage_door_locked: mockTriggerLocked,
            controller_rebooted: mockTriggerRebooted,
          };
          return cards[id];
        }),
      },
    };
  });

  describe('onInit', () => {
    it('should read store values and create client', async () => {
      await device.onInit();

      expect((device as any).getStore).toHaveBeenCalled();
      expect(TailwindClient).toHaveBeenCalledWith('869769');
      expect((device as any).registerCapabilityListener).toHaveBeenCalledWith(
        'garagedoor_closed',
        expect.any(Function),
      );
    });

    it('should poll device status on init', async () => {
      await device.onInit();

      expect(mockGetDeviceStatus).toHaveBeenCalledWith('tailwind-abc123.local');
    });

    it('should set garagedoor_closed to true when door is closed', async () => {
      await device.onInit();

      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', true);
    });

    it('should set garagedoor_closed to false when door is open', async () => {
      mockGetDeviceStatus.mockResolvedValue({
        result: 'OK',
        data: {
          door1: { index: 0, status: 'open', lockup: 0, disabled: 0 },
        },
      });

      await device.onInit();

      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', false);
    });

    it('should handle second door index correctly', async () => {
      (device as any).getStore = jest.fn().mockReturnValue({
        ...mockStore,
        doorIndex: 1,
      });

      mockGetDeviceStatus.mockResolvedValue({
        result: 'OK',
        data: {
          door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
          door2: { index: 1, status: 'open', lockup: 0, disabled: 0 },
        },
      });

      await device.onInit();

      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', false);
    });
  });

  describe('migration from legacy store', () => {
    it('should migrate controllerIp to controllerHost when controllerHost is missing', async () => {
      (device as any).getStore = jest.fn().mockReturnValue({
        controllerIp: '192.168.1.100',
        doorIndex: 0,
        localKey: '869769',
      });

      await device.onInit();

      expect((device as any).setStoreValue).toHaveBeenCalledWith('controllerHost', '192.168.1.100');
      expect(mockGetDeviceStatus).toHaveBeenCalledWith('192.168.1.100');
    });

    it('should prefer controllerHostname over controllerIp during migration', async () => {
      (device as any).getStore = jest.fn().mockReturnValue({
        controllerIp: '192.168.1.100',
        controllerHostname: 'tailwind-abc.local',
        doorIndex: 0,
        localKey: '869769',
      });

      await device.onInit();

      expect((device as any).setStoreValue).toHaveBeenCalledWith(
        'controllerHost',
        'tailwind-abc.local',
      );
      expect(mockGetDeviceStatus).toHaveBeenCalledWith('tailwind-abc.local');
    });

    it('should not migrate when controllerHost already exists', async () => {
      await device.onInit();

      expect((device as any).setStoreValue).not.toHaveBeenCalledWith(
        'controllerHost',
        expect.anything(),
      );
    });
  });

  describe('settings initialization', () => {
    it('should sync store values to settings on init', async () => {
      await device.onInit();

      expect((device as any).setSettings).toHaveBeenCalledWith({
        controllerHost: 'tailwind-abc123.local',
        localKey: '869769',
      });
    });
  });

  describe('onCapabilityGarageDoorClosed', () => {
    beforeEach(async () => {
      await device.onInit();
      jest.clearAllMocks();
    });

    it('should send close command when value is true', async () => {
      await (device as any).onCapabilityGarageDoorClosed(true);
      expect(mockControlDoor).toHaveBeenCalledWith('tailwind-abc123.local', 0, 'close');
    });

    it('should send open command when value is false', async () => {
      await (device as any).onCapabilityGarageDoorClosed(false);
      expect(mockControlDoor).toHaveBeenCalledWith('tailwind-abc123.local', 0, 'open');
    });
  });

  describe('polling', () => {
    it('should schedule next poll after completion', async () => {
      await device.onInit();

      expect((device as any).homey.setTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should re-register notify_url on each successful poll', async () => {
      await device.onInit();
      await jest.advanceTimersByTimeAsync(0);
      jest.clearAllMocks();

      // Advance to next poll cycle
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockRegisterNotifyUrl).toHaveBeenCalledWith(
        'tailwind-abc123.local',
        expect.stringContaining('/api/app/com.dn.tailwind/notification'),
      );
    });

    it('should not re-register notify_url when poll fails', async () => {
      await device.onInit();
      await jest.advanceTimersByTimeAsync(0);
      jest.clearAllMocks();

      mockGetDeviceStatus.mockRejectedValue(new Error('Network error'));
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockRegisterNotifyUrl).not.toHaveBeenCalled();
    });

    it('should mark device unavailable on poll failure', async () => {
      mockGetDeviceStatus.mockRejectedValue(new Error('Network error'));

      // Directly invoke the private poll method which will fail
      await (device as any).onInit();

      expect((device as any).setUnavailable).toHaveBeenCalledWith('Cannot reach controller');
    });
  });

  describe('discovery lifecycle', () => {
    it('onDiscoveryResult should match by discoveryId', async () => {
      (device as any).getStore = jest.fn().mockReturnValue({
        ...mockStore,
        discoveryId: 'TW-WebServer',
      });
      await device.onInit();

      const match = device.onDiscoveryResult({ id: 'TW-WebServer', address: '192.168.1.100' });
      expect(match).toBe(true);
    });

    it('onDiscoveryResult should not match different discoveryId', async () => {
      (device as any).getStore = jest.fn().mockReturnValue({
        ...mockStore,
        discoveryId: 'TW-WebServer',
      });
      await device.onInit();

      const match = device.onDiscoveryResult({ id: 'SomeOtherDevice', address: '192.168.1.50' });
      expect(match).toBe(false);
    });

    it('onDiscoveryResult should match by hostname fallback', async () => {
      await device.onInit();

      const match = device.onDiscoveryResult({
        id: 'unknown',
        host: 'tailwind-abc123.local',
        address: '192.168.1.200',
      });
      expect(match).toBe(true);
    });

    it('onDiscoveryResult should not match when hostnames differ', async () => {
      await device.onInit();

      const match = device.onDiscoveryResult({
        id: 'unknown',
        host: 'tailwind-different.local',
        address: '192.168.1.200',
      });
      expect(match).toBe(false);
    });

    it('onDiscoveryAvailable should log without updating store', async () => {
      await device.onInit();
      jest.clearAllMocks();

      await device.onDiscoveryAvailable({ address: '192.168.1.250' });

      expect((device as any).log).toHaveBeenCalledWith(
        expect.stringContaining('controller available'),
      );
      expect((device as any).setStoreValue).not.toHaveBeenCalled();
    });
  });

  describe('onSettings', () => {
    beforeEach(async () => {
      await device.onInit();
      jest.clearAllMocks();
    });

    it('should update controllerHost when changed', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: 'new-host.local' },
        changedKeys: ['controllerHost'],
      });

      expect((device as any).setStoreValue).toHaveBeenCalledWith(
        'controllerHost',
        'new-host.local',
      );
    });

    it('should update localKey and create new client when changed', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { localKey: '999999' },
        changedKeys: ['localKey'],
      });

      expect((device as any).setStoreValue).toHaveBeenCalledWith('localKey', '999999');
      expect(TailwindClient).toHaveBeenCalledWith('999999');
    });

    it('should handle multiple settings changed at once', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: 'new.local', localKey: '111111' },
        changedKeys: ['controllerHost', 'localKey'],
      });

      expect((device as any).setStoreValue).toHaveBeenCalledWith('controllerHost', 'new.local');
      expect((device as any).setStoreValue).toHaveBeenCalledWith('localKey', '111111');
      expect(TailwindClient).toHaveBeenCalledWith('111111');
    });

    it('should not update controllerHost when only localKey changed', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { localKey: '222222' },
        changedKeys: ['localKey'],
      });

      expect((device as any).setStoreValue).not.toHaveBeenCalledWith(
        'controllerHost',
        expect.anything(),
      );
      expect((device as any).setStoreValue).toHaveBeenCalledWith('localKey', '222222');
    });

    it('should not update localKey when only controllerHost changed', async () => {
      const initialCallCount = (TailwindClient as jest.MockedClass<typeof TailwindClient>).mock
        .calls.length;

      await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: '10.0.0.1' },
        changedKeys: ['controllerHost'],
      });

      expect((device as any).setStoreValue).not.toHaveBeenCalledWith('localKey', expect.anything());
      // Should not create a new client
      expect(TailwindClient).toHaveBeenCalledTimes(initialCallCount);
    });

    it('should reject empty controllerHost', async () => {
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { controllerHost: '' },
          changedKeys: ['controllerHost'],
        }),
      ).rejects.toThrow('Invalid controller host');
    });

    it('should reject controllerHost with spaces', async () => {
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { controllerHost: 'host name' },
          changedKeys: ['controllerHost'],
        }),
      ).rejects.toThrow('Invalid controller host');
    });

    it('should reject controllerHost longer than 253 characters', async () => {
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { controllerHost: 'a'.repeat(254) },
          changedKeys: ['controllerHost'],
        }),
      ).rejects.toThrow('Invalid controller host');
    });

    it('should reject localKey that is not 6 digits', async () => {
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { localKey: '12345' },
          changedKeys: ['localKey'],
        }),
      ).rejects.toThrow('Invalid local key: must be exactly 6 digits');
    });

    it('should reject localKey with non-numeric characters', async () => {
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { localKey: 'abcdef' },
          changedKeys: ['localKey'],
        }),
      ).rejects.toThrow('Invalid local key: must be exactly 6 digits');
    });

    it('should reject localKey that is too long', async () => {
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { localKey: '1234567' },
          changedKeys: ['localKey'],
        }),
      ).rejects.toThrow('Invalid local key: must be exactly 6 digits');
    });

    it('should accept valid IPv4 address as controllerHost', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: '192.168.1.100' },
        changedKeys: ['controllerHost'],
      });

      expect(mockGetDeviceStatus).toHaveBeenCalledWith('192.168.1.100');
    });

    it('should accept valid hostname as controllerHost', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: 'tailwind-abc.local' },
        changedKeys: ['controllerHost'],
      });

      expect(mockGetDeviceStatus).toHaveBeenCalledWith('tailwind-abc.local');
    });

    it('should accept valid 6-digit localKey', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { localKey: '000000' },
        changedKeys: ['localKey'],
      });

      expect(TailwindClient).toHaveBeenCalledWith('000000');
    });

    it('should validate connection with new host before applying changes', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: 'new-host.local' },
        changedKeys: ['controllerHost'],
      });

      expect(mockGetDeviceStatus).toHaveBeenCalledWith('new-host.local');
    });

    it('should validate connection with new key before applying changes', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { localKey: '999999' },
        changedKeys: ['localKey'],
      });

      // Should create a new client with the new key and test the connection
      expect(TailwindClient).toHaveBeenCalledWith('999999');
      expect(mockGetDeviceStatus).toHaveBeenCalled();
    });

    it('should throw when connection validation fails', async () => {
      mockGetDeviceStatus.mockRejectedValue(new Error('Connection refused'));

      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { controllerHost: 'bad-host.local' },
          changedKeys: ['controllerHost'],
        }),
      ).rejects.toThrow('Could not connect to controller with new settings');
    });

    it('should not update store when connection validation fails', async () => {
      mockGetDeviceStatus.mockRejectedValue(new Error('Connection refused'));

      await device
        .onSettings({
          oldSettings: {},
          newSettings: { controllerHost: 'bad-host.local' },
          changedKeys: ['controllerHost'],
        })
        .catch(() => {});

      expect((device as any).setStoreValue).not.toHaveBeenCalled();
    });

    it('should return success message when validation passes', async () => {
      const result = await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: 'new-host.local' },
        changedKeys: ['controllerHost'],
      });

      expect(result).toBe('Settings saved. Connection verified.');
    });

    it('should re-register notify_url with new host in query param after settings change', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: 'new-host.local' },
        changedKeys: ['controllerHost'],
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(mockRegisterNotifyUrl).toHaveBeenCalledWith(
        'new-host.local',
        'http://192.168.1.50/api/app/com.dn.tailwind/notification?host=new-host.local',
      );
    });

    it('should re-register notify_url with new key after localKey change', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: { localKey: '999999' },
        changedKeys: ['localKey'],
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(mockRegisterNotifyUrl).toHaveBeenCalled();
    });

    it('should not fail settings save if re-registration fails', async () => {
      mockRegisterNotifyUrl.mockRejectedValue(new Error('Re-registration failed'));

      const result = await device.onSettings({
        oldSettings: {},
        newSettings: { controllerHost: 'new-host.local' },
        changedKeys: ['controllerHost'],
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(result).toBe('Settings saved. Connection verified.');
    });

    it('should validate with combined new values when multiple settings change', async () => {
      await device.onSettings({
        oldSettings: {},
        newSettings: {
          controllerHost: 'new.local',
          localKey: '111111',
        },
        changedKeys: ['controllerHost', 'localKey'],
      });

      // New client for new key
      expect(TailwindClient).toHaveBeenCalledWith('111111');
      // Should use new host
      expect(mockGetDeviceStatus).toHaveBeenCalledWith('new.local');
    });
  });

  describe('capability listener wiring', () => {
    it('should wire registered listener to onCapabilityGarageDoorClosed', async () => {
      await device.onInit();

      const listenerCall = (device as any).registerCapabilityListener.mock.calls.find(
        (call: any[]) => call[0] === 'garagedoor_closed',
      );
      expect(listenerCall).toBeDefined();

      const callback = listenerCall[1];
      jest.clearAllMocks();

      await callback(true);
      expect(mockControlDoor).toHaveBeenCalledWith('tailwind-abc123.local', 0, 'close');
    });
  });

  describe('poll error recovery', () => {
    it('should recover and set available after a failed poll', async () => {
      mockGetDeviceStatus.mockRejectedValueOnce(new Error('Network error')).mockResolvedValue({
        result: 'OK',
        data: { door1: { index: 0, status: 'close', lockup: 0, disabled: 0 } },
      });

      await device.onInit();
      expect((device as any).setUnavailable).toHaveBeenCalled();

      jest.clearAllMocks();
      // Advance to next poll cycle
      await jest.advanceTimersByTimeAsync(30000);

      expect((device as any).setAvailable).toHaveBeenCalled();
      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', true);
    });

    it('should stay unavailable across multiple failed polls', async () => {
      mockGetDeviceStatus.mockRejectedValue(new Error('Network error'));

      await device.onInit();
      expect((device as any).setUnavailable).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(30000);
      expect((device as any).setUnavailable).toHaveBeenCalledTimes(2);
    });
  });

  describe('pollDeviceStatus edge cases', () => {
    it('should not set capability when doorData is missing from response', async () => {
      mockGetDeviceStatus.mockResolvedValue({
        result: 'OK',
        data: {},
      });

      await device.onInit();

      expect((device as any).setCapabilityValue).not.toHaveBeenCalled();
      expect((device as any).setAvailable).toHaveBeenCalled();
    });

    it('should not set capability when response.data is undefined', async () => {
      mockGetDeviceStatus.mockResolvedValue({ result: 'OK' });

      await device.onInit();

      expect((device as any).setCapabilityValue).not.toHaveBeenCalled();
      expect((device as any).setAvailable).toHaveBeenCalled();
    });

    it('should handle doorIndex 2 (third door) correctly', async () => {
      (device as any).getStore = jest.fn().mockReturnValue({
        ...mockStore,
        doorIndex: 2,
      });

      mockGetDeviceStatus.mockResolvedValue({
        result: 'OK',
        data: {
          door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
          door2: { index: 1, status: 'close', lockup: 0, disabled: 0 },
          door3: { index: 2, status: 'open', lockup: 0, disabled: 0 },
        },
      });

      await device.onInit();

      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', false);
    });

    it('should reschedule poll timer even after error', async () => {
      mockGetDeviceStatus.mockRejectedValue(new Error('Timeout'));

      await device.onInit();

      // Timer should still be scheduled despite the error (finally block)
      expect((device as any).homey.setTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
    });
  });

  describe('onCapabilityGarageDoorClosed edge case', () => {
    it('should throw when client is not initialized', async () => {
      // Don't call onInit — client stays null
      await expect((device as any).onCapabilityGarageDoorClosed(true)).rejects.toThrow(
        'Client not initialized',
      );
    });
  });

  describe('onDiscoveryLastSeenChanged', () => {
    it('should log the event', async () => {
      await device.onInit();
      await device.onDiscoveryLastSeenChanged({ address: '192.168.1.100' });

      expect((device as any).log).toHaveBeenCalledWith(
        expect.stringContaining('last seen changed'),
      );
    });
  });

  describe('notifications', () => {
    it('should register notification listener on init', async () => {
      await device.onInit();

      expect((device as any).homey.on).toHaveBeenCalledWith(
        'tailwind:notification',
        expect.any(Function),
      );
    });

    it('should register notify_url with controller host as query param', async () => {
      await device.onInit();
      // Allow the fire-and-forget promise to resolve
      await jest.advanceTimersByTimeAsync(0);

      expect(mockRegisterNotifyUrl).toHaveBeenCalledWith(
        'tailwind-abc123.local',
        'http://192.168.1.50/api/app/com.dn.tailwind/notification?host=tailwind-abc123.local',
      );
    });

    it('should update capability when notification matches controller host', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: {
            door1: { index: 0, status: 'open', lockup: 0, disabled: 0 },
          },
          notify: { door_idx: 0, event: 'open' },
        },
        'tailwind-abc123.local',
      );

      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', false);
    });

    it('should update from full status even when a different door triggered the event', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: {
            door1: { index: 0, status: 'open', lockup: 0, disabled: 0 },
            door2: { index: 1, status: 'close', lockup: 0, disabled: 0 },
          },
          notify: { door_idx: 1, event: 'close' },
        },
        'tailwind-abc123.local',
      );

      // Door 1's device should still update from the full status
      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', false);
    });

    it('should ignore notifications from a different controller host', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: {
            door1: { index: 0, status: 'open', lockup: 0, disabled: 0 },
          },
          notify: { door_idx: 0, event: 'open' },
        },
        'other-controller.local',
      );

      expect((device as any).setCapabilityValue).not.toHaveBeenCalled();
    });

    it('should process notification when sourceHost is missing (single-controller fallback)', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit('tailwind:notification', {
        result: 'OK',
        data: {
          door1: { index: 0, status: 'open', lockup: 0, disabled: 0 },
        },
        notify: { door_idx: 0, event: 'open' },
      });

      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', false);
    });

    it('should ignore when door data is missing from notification', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: {},
          notify: { door_idx: 0, event: 'open' },
        },
        'tailwind-abc123.local',
      );

      expect((device as any).setCapabilityValue).not.toHaveBeenCalled();
    });

    it('should re-register notify_url on reboot event', async () => {
      await device.onInit();
      await jest.advanceTimersByTimeAsync(0);
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: {
            door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
          },
          notify: { door_idx: 0, event: 'reboot' },
        },
        'tailwind-abc123.local',
      );

      // Allow the fire-and-forget re-registration promise to resolve
      await jest.advanceTimersByTimeAsync(0);

      expect(mockRegisterNotifyUrl).toHaveBeenCalled();
    });

    it('should not fail when notify_url registration fails', async () => {
      mockRegisterNotifyUrl.mockRejectedValue(new Error('Registration failed'));

      await device.onInit();
      await jest.advanceTimersByTimeAsync(0);

      // Device should still function — error is logged but not thrown
      expect((device as any).error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register'),
        expect.any(Error),
      );
    });

    it('should handle notification for second door device', async () => {
      (device as any).getStore = jest.fn().mockReturnValue({ ...mockStore, doorIndex: 1 });
      (device as any).getData = jest.fn().mockReturnValue({ id: '_test_id__door2' });

      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: {
            door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
            door2: { index: 1, status: 'open', lockup: 0, disabled: 0 },
          },
          notify: { door_idx: 1, event: 'open' },
        },
        'tailwind-abc123.local',
      );

      expect((device as any).setCapabilityValue).toHaveBeenCalledWith('garagedoor_closed', false);
    });
  });

  describe('flow trigger cards', () => {
    it('should register all four trigger cards on init', async () => {
      await device.onInit();

      const getCard = (device as any).homey.flow.getDeviceTriggerCard;
      expect(getCard).toHaveBeenCalledWith('garage_door_opened');
      expect(getCard).toHaveBeenCalledWith('garage_door_closed');
      expect(getCard).toHaveBeenCalledWith('garage_door_locked');
      expect(getCard).toHaveBeenCalledWith('controller_rebooted');
    });

    it('should trigger garage_door_opened when open event received for matching door', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
          notify: { door_idx: 0, event: 'open' },
        },
        'tailwind-abc123.local',
      );

      expect(mockTriggerOpened.trigger).toHaveBeenCalledWith(device, {}, {});
      expect(mockTriggerClosed.trigger).not.toHaveBeenCalled();
    });

    it('should trigger garage_door_closed when close event received for matching door', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: { door1: { index: 0, status: 'close', lockup: 0, disabled: 0 } },
          notify: { door_idx: 0, event: 'close' },
        },
        'tailwind-abc123.local',
      );

      expect(mockTriggerClosed.trigger).toHaveBeenCalledWith(device, {}, {});
      expect(mockTriggerOpened.trigger).not.toHaveBeenCalled();
    });

    it('should trigger garage_door_locked when lock event received for matching door', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: { door1: { index: 0, status: 'close', lockup: 1, disabled: 0 } },
          notify: { door_idx: 0, event: 'lock' },
        },
        'tailwind-abc123.local',
      );

      expect(mockTriggerLocked.trigger).toHaveBeenCalledWith(device, {}, {});
    });

    it('should trigger controller_rebooted when reboot event received', async () => {
      await device.onInit();
      await jest.advanceTimersByTimeAsync(0);
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: { door1: { index: 0, status: 'close', lockup: 0, disabled: 0 } },
          notify: { door_idx: 0, event: 'reboot' },
        },
        'tailwind-abc123.local',
      );

      expect(mockTriggerRebooted.trigger).toHaveBeenCalledWith(device, {}, {});
    });

    it('should not trigger door-specific cards when event is for a different door', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: {
            door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
            door2: { index: 1, status: 'open', lockup: 0, disabled: 0 },
          },
          notify: { door_idx: 1, event: 'open' },
        },
        'tailwind-abc123.local',
      );

      expect(mockTriggerOpened.trigger).not.toHaveBeenCalled();
    });

    it('should not trigger when notification is from different controller host', async () => {
      await device.onInit();
      jest.clearAllMocks();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
          notify: { door_idx: 0, event: 'open' },
        },
        'other-controller.local',
      );

      expect(mockTriggerOpened.trigger).not.toHaveBeenCalled();
    });

    it('should not throw if trigger card fire fails', async () => {
      mockTriggerOpened.trigger.mockRejectedValue(new Error('Flow error'));

      await device.onInit();
      jest.clearAllMocks();
      mockTriggerOpened.trigger.mockRejectedValue(new Error('Flow error'));

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
          notify: { door_idx: 0, event: 'open' },
        },
        'tailwind-abc123.local',
      );

      // Should not throw — error is caught internally
      await jest.advanceTimersByTimeAsync(0);
    });

    it('should trigger garage_door_opened when poll detects state change from closed to open', async () => {
      // First poll returns closed (initial state)
      await device.onInit();
      jest.clearAllMocks();

      // Second poll returns open
      mockGetDeviceStatus.mockResolvedValue({
        result: 'OK',
        data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
      });
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockTriggerOpened.trigger).toHaveBeenCalledWith(device, {}, {});
      expect(mockTriggerClosed.trigger).not.toHaveBeenCalled();
    });

    it('should trigger garage_door_closed when poll detects state change from open to closed', async () => {
      // First poll returns open
      mockGetDeviceStatus.mockResolvedValue({
        result: 'OK',
        data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
      });
      await device.onInit();
      jest.clearAllMocks();

      // Second poll returns closed
      mockGetDeviceStatus.mockResolvedValue({
        result: 'OK',
        data: { door1: { index: 0, status: 'close', lockup: 0, disabled: 0 } },
      });
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockTriggerClosed.trigger).toHaveBeenCalledWith(device, {}, {});
      expect(mockTriggerOpened.trigger).not.toHaveBeenCalled();
    });

    it('should not trigger when poll detects no state change', async () => {
      // First poll returns closed
      await device.onInit();
      jest.clearAllMocks();

      // Second poll also returns closed
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockTriggerOpened.trigger).not.toHaveBeenCalled();
      expect(mockTriggerClosed.trigger).not.toHaveBeenCalled();
    });

    it('should not double-fire trigger when notification already updated state before poll', async () => {
      await device.onInit();
      jest.clearAllMocks();

      // Notification changes state to open
      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
          notify: { door_idx: 0, event: 'open' },
        },
        'tailwind-abc123.local',
      );

      expect(mockTriggerOpened.trigger).toHaveBeenCalledTimes(1);
      jest.clearAllMocks();

      // Next poll also sees open — should NOT trigger again
      mockGetDeviceStatus.mockResolvedValue({
        result: 'OK',
        data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
      });
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockTriggerOpened.trigger).not.toHaveBeenCalled();
    });
  });

  describe('onDeleted', () => {
    it('should clean up timer and client', async () => {
      await device.onInit();
      await device.onDeleted();

      expect((device as any).homey.clearTimeout).toHaveBeenCalled();
    });

    it('should remove notification listener', async () => {
      await device.onInit();
      await device.onDeleted();

      expect((device as any).homey.removeListener).toHaveBeenCalledWith(
        'tailwind:notification',
        expect.any(Function),
      );
    });

    it('should not receive notifications after deletion', async () => {
      await device.onInit();
      jest.clearAllMocks();
      await device.onDeleted();

      homeyEmitter.emit(
        'tailwind:notification',
        {
          result: 'OK',
          data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
          notify: { door_idx: 0, event: 'open' },
        },
        'tailwind-abc123.local',
      );

      expect((device as any).setCapabilityValue).not.toHaveBeenCalled();
    });
  });
});
