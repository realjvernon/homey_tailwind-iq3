import { TailwindClient } from '../TailwindClient';

class MockResponse {
  private readonly _ok: boolean;
  private readonly _status: number;
  private readonly _data: any;

  constructor(data: any, init?: { ok?: boolean; status?: number }) {
    this._ok = init?.ok ?? true;
    this._status = init?.status ?? 200;
    this._data = data;
  }

  get ok() {
    return this._ok;
  }
  get status() {
    return this._status;
  }

  async json(): Promise<any> {
    return this._data;
  }

  async text() {
    return JSON.stringify(this._data);
  }
}

describe('TailwindClient', () => {
  let client: TailwindClient;
  const testHost = 'tailwind-abc123.local';
  const testKey = '869769';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    global.fetch = jest.fn();
    client = new TailwindClient(testKey);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getDeviceStatus', () => {
    it('should get device status with correct API format', async () => {
      const mockResponse = {
        result: 'OK',
        product: 'iQ3',
        dev_id: '_30_ae_a4_80_18_80_',
        door_num: 2,
        fw_ver: '10.10',
        data: {
          door1: { index: 0, status: 'close', lockup: 0, disabled: 0 },
          door2: { index: 1, status: 'open', lockup: 0, disabled: 0 },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse(mockResponse));

      const status = await client.getDeviceStatus(testHost);
      expect(status.result).toBe('OK');
      expect(status.door_num).toBe(2);
      expect(status.data?.door1?.status).toBe('close');
      expect(status.data?.door2?.status).toBe('open');

      expect(global.fetch).toHaveBeenCalledWith(
        `http://${testHost}/json`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ TOKEN: testKey }),
          body: expect.stringContaining('"name":"dev_st"'),
        }),
      );
    });

    it('should send version 0.1 in commands', async () => {
      const mockResponse = { result: 'OK', data: {} };

      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse(mockResponse));

      await client.getDeviceStatus(testHost);

      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1]!.body as string);
      expect(callBody.version).toBe('0.1');
    });
  });

  describe('controlDoor', () => {
    it('should send correct door control command', async () => {
      const mockResponse = { result: 'OK' };

      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse(mockResponse));

      await client.controlDoor(testHost, 0, 'open');

      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1]!.body as string);
      expect(callBody.product).toBe('iQ3');
      expect(callBody.data.name).toBe('door_op');
      expect(callBody.data.value.door_idx).toBe(0);
      expect(callBody.data.value.cmd).toBe('open');
    });

    it('should send close command', async () => {
      const mockResponse = { result: 'OK' };

      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse(mockResponse));

      await client.controlDoor(testHost, 1, 'close');

      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1]!.body as string);
      expect(callBody.data.value.door_idx).toBe(1);
      expect(callBody.data.value.cmd).toBe('close');
    });
  });

  describe('error handling', () => {
    it('should handle API Fail responses', async () => {
      const mockResponse = {
        result: 'Fail',
        info: 'Invalid command',
      };

      (global.fetch as jest.Mock).mockResolvedValue(new MockResponse(mockResponse));

      const promise = client.controlDoor(testHost, 0, 'close');
      // Attach rejection handler before advancing timers to avoid unhandled rejection
      const assertion = expect(promise).rejects.toThrow('Invalid command');
      await jest.advanceTimersByTimeAsync(3000);
      await assertion;
    });

    it('should handle HTTP errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new MockResponse({}, { ok: false, status: 400 }),
      );

      const promise = client.controlDoor(testHost, 0, 'close');
      const assertion = expect(promise).rejects.toThrow('HTTP error! status: 400');
      await jest.advanceTimersByTimeAsync(3000);
      await assertion;
    });

    it('should retry failed requests up to 3 times', async () => {
      const mockError = new Error('Network error');
      const mockResponse = { result: 'OK' };

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(new MockResponse(mockResponse));

      const promise = client.controlDoor(testHost, 0, 'open');

      // Advance past first retry delay (1000ms) then second (2000ms)
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result).toEqual({ result: 'OK' });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exhausted', async () => {
      const mockError = new Error('Network error');

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError);

      const promise = client.getDeviceStatus(testHost);
      const assertion = expect(promise).rejects.toThrow('Network error');
      await jest.advanceTimersByTimeAsync(3000);
      await assertion;
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw "Unknown API error" when Fail response has no info', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(new MockResponse({ result: 'Fail' }));

      const promise = client.controlDoor(testHost, 0, 'open');
      const assertion = expect(promise).rejects.toThrow('Unknown API error');
      await jest.advanceTimersByTimeAsync(3000);
      await assertion;
    });

    it('should throw "Unknown API error" when Fail response has empty info', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(new MockResponse({ result: 'Fail', info: '' }));

      const promise = client.controlDoor(testHost, 0, 'open');
      const assertion = expect(promise).rejects.toThrow('Unknown API error');
      await jest.advanceTimersByTimeAsync(3000);
      await assertion;
    });

    it('should use exponential backoff delays between retries', async () => {
      const mockError = new Error('Network error');

      (global.fetch as jest.Mock).mockRejectedValue(mockError);

      const promise = client.getDeviceStatus(testHost);
      const assertion = expect(promise).rejects.toThrow('Network error');

      // After first failure, should wait 1000ms (1000 * 2^0)
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance 999ms — second attempt should NOT have started yet
      await jest.advanceTimersByTimeAsync(999);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance 1ms more (total 1000ms) — second attempt starts
      await jest.advanceTimersByTimeAsync(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // After second failure, should wait 2000ms (1000 * 2^1)
      await jest.advanceTimersByTimeAsync(1999);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(1);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      await assertion;
    });
  });

  describe('registerNotifyUrl', () => {
    it('should send correct notify_url registration command', async () => {
      const mockResponse = { result: 'OK' };

      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse(mockResponse));

      await client.registerNotifyUrl(
        testHost,
        'http://192.168.1.10/api/app/com.dn.tailwind/notification',
      );

      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1]!.body as string);
      expect(callBody.product).toBe('iQ3');
      expect(callBody.data.type).toBe('set');
      expect(callBody.data.name).toBe('notify_url');
      expect(callBody.data.value).toEqual({
        enable: 1,
        proto: 'http',
        url: 'http://192.168.1.10/api/app/com.dn.tailwind/notification',
      });
    });

    it('should include version 0.1', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse({ result: 'OK' }));

      await client.registerNotifyUrl(testHost, 'http://192.168.1.10/notification');

      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1]!.body as string);
      expect(callBody.version).toBe('0.1');
    });
  });

  describe('unregisterNotifyUrl', () => {
    it('should send notify_url disable command', async () => {
      const mockResponse = { result: 'OK' };

      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse(mockResponse));

      await client.unregisterNotifyUrl(testHost);

      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1]!.body as string);
      expect(callBody.product).toBe('iQ3');
      expect(callBody.data.type).toBe('set');
      expect(callBody.data.name).toBe('notify_url');
      expect(callBody.data.value).toEqual({ enable: 0 });
    });
  });

  describe('authentication', () => {
    it('should use TOKEN header for authentication', async () => {
      const mockResponse = { result: 'OK', data: {} };

      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse(mockResponse));

      await client.getDeviceStatus(testHost);

      const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1]!.headers as Record<
        string,
        string
      >;
      expect(callHeaders.TOKEN).toBe(testKey);
      expect(callHeaders['X-Auth-Token']).toBeUndefined();
    });

    it('should set Content-Type to application/json', async () => {
      const mockResponse = { result: 'OK', data: {} };

      (global.fetch as jest.Mock).mockResolvedValueOnce(new MockResponse(mockResponse));

      await client.getDeviceStatus(testHost);

      const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1]!.headers as Record<
        string,
        string
      >;
      expect(callHeaders['Content-Type']).toBe('application/json');
    });
  });
});
