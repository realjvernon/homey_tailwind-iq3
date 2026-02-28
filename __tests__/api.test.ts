import { receiveNotification, getNotificationLog } from '../api';

describe('api', () => {
  describe('receiveNotification', () => {
    let mockHomey: {
      app: { handleNotification: jest.Mock; getNotificationLog: jest.Mock };
      log: jest.Mock;
      error: jest.Mock;
    };

    beforeEach(() => {
      mockHomey = {
        app: { handleNotification: jest.fn(), getNotificationLog: jest.fn() },
        log: jest.fn(),
        error: jest.fn(),
      };
    });

    it('should call handleNotification on the app with the body', async () => {
      const body = {
        result: 'OK',
        dev_id: '30_ae_a4_80_18_80',
        data: {
          door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
        },
        notify: { door_idx: 0, event: 'close' },
      };

      const result = await receiveNotification({ homey: mockHomey, body });

      expect(mockHomey.app.handleNotification).toHaveBeenCalledWith(body, undefined);
      expect(result).toBe(true);
    });

    it('should forward query.host to handleNotification as sourceHost', async () => {
      const body = {
        result: 'OK',
        data: { door1: { index: 0, status: 'open', lockup: 0, disabled: 0 } },
        notify: { door_idx: 0, event: 'open' },
      };

      await receiveNotification({
        homey: mockHomey,
        body,
        query: { host: 'tailwind-abc.local' },
      });

      expect(mockHomey.app.handleNotification).toHaveBeenCalledWith(body, 'tailwind-abc.local');
    });

    it('should pass undefined sourceHost when query has no host', async () => {
      const body = { result: 'OK', data: {} };

      await receiveNotification({ homey: mockHomey, body, query: {} });

      expect(mockHomey.app.handleNotification).toHaveBeenCalledWith(body, undefined);
    });

    it('should return true even when body has minimal fields', async () => {
      const body = { result: 'OK', data: {} };

      const result = await receiveNotification({ homey: mockHomey, body });

      expect(mockHomey.app.handleNotification).toHaveBeenCalledWith(body, undefined);
      expect(result).toBe(true);
    });

    it('should throw when body is missing', async () => {
      await expect(receiveNotification({ homey: mockHomey, body: null })).rejects.toThrow(
        'Invalid notification payload',
      );
    });

    it('should throw when body has no result field', async () => {
      await expect(receiveNotification({ homey: mockHomey, body: { data: {} } })).rejects.toThrow(
        'Invalid notification payload',
      );
    });
  });

  describe('getNotificationLog', () => {
    let mockHomey: {
      app: { getNotificationLog: jest.Mock };
    };

    beforeEach(() => {
      mockHomey = {
        app: {
          getNotificationLog: jest.fn().mockReturnValue([
            {
              payload: { result: 'OK', notify: { door_idx: 0, event: 'open' } },
              timestamp: '2026-01-01T00:00:00.000Z',
            },
          ]),
        },
      };
    });

    it('should return the notification log from the app', async () => {
      const result = await getNotificationLog({ homey: mockHomey });

      expect(mockHomey.app.getNotificationLog).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].payload.notify.event).toBe('open');
    });
  });
});
