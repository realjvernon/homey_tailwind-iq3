import TailwindApp from '../app';

describe('TailwindApp', () => {
  let app: TailwindApp;

  beforeEach(() => {
    jest.clearAllMocks();
    app = new TailwindApp();
    (app as any).log = jest.fn();
    (app as any).error = jest.fn();
    (app as any).homey = {
      emit: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    };
  });

  describe('onInit', () => {
    it('should log initialization message', async () => {
      await app.onInit();
      expect((app as any).log).toHaveBeenCalledWith('Tailwind app has been initialized');
    });
  });

  describe('handleNotification', () => {
    it('should emit tailwind:notification event on homey', () => {
      const payload = {
        result: 'OK' as const,
        dev_id: '30_ae_a4_80_18_80',
        data: {
          door1: { index: 0, status: 'close' as const, lockup: 0, disabled: 0 },
        },
        notify: { door_idx: 0, event: 'close' as const },
      };

      app.handleNotification(payload);

      expect((app as any).homey.emit).toHaveBeenCalledWith(
        'tailwind:notification',
        payload,
        undefined,
      );
    });

    it('should forward sourceHost in the emitted event', () => {
      const payload = {
        result: 'OK' as const,
        data: {
          door1: { index: 0, status: 'open' as const, lockup: 0, disabled: 0 },
        },
        notify: { door_idx: 0, event: 'open' as const },
      };

      app.handleNotification(payload, 'tailwind-abc.local');

      expect((app as any).homey.emit).toHaveBeenCalledWith(
        'tailwind:notification',
        payload,
        'tailwind-abc.local',
      );
    });

    it('should log the notification event', () => {
      const payload = {
        result: 'OK' as const,
        notify: { door_idx: 1, event: 'open' as const },
      };

      app.handleNotification(payload);

      expect((app as any).log).toHaveBeenCalledWith('Received notification:', payload.notify);
    });

    it('should emit even when notify field is missing', () => {
      const payload = {
        result: 'OK' as const,
        data: {
          door1: { index: 0, status: 'close' as const, lockup: 0, disabled: 0 },
        },
      };

      app.handleNotification(payload);

      expect((app as any).homey.emit).toHaveBeenCalledWith(
        'tailwind:notification',
        payload,
        undefined,
      );
    });

    it('should store notification in log', () => {
      const payload = {
        result: 'OK' as const,
        notify: { door_idx: 0, event: 'open' as const },
      };

      app.handleNotification(payload);

      const log = app.getNotificationLog();
      expect(log).toHaveLength(1);
      expect(log[0].payload).toEqual(payload);
      expect(log[0].timestamp).toEqual(expect.any(String));
    });

    it('should store up to 10 notifications', () => {
      for (let i = 0; i < 12; i++) {
        app.handleNotification({
          result: 'OK' as const,
          notify: { door_idx: 0, event: 'open' as const },
          dev_id: `controller_${i}`,
        });
      }

      const log = app.getNotificationLog();
      expect(log).toHaveLength(10);
      // Oldest entries (0, 1) should have been evicted
      expect(log[0].payload.dev_id).toBe('controller_2');
      expect(log[9].payload.dev_id).toBe('controller_11');
    });

    it('should return empty log initially', () => {
      expect(app.getNotificationLog()).toEqual([]);
    });
  });
});
