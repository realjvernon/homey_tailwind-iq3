// --- Interfaces matching the real Tailwind Local Control API ---

export interface DoorStatus {
  index: number;
  status: 'open' | 'close';
  lockup: number;
  disabled: number;
}

export interface TailwindStatusResponse {
  result: 'OK' | 'Fail';
  product?: string;
  dev_id?: string;
  proto_ver?: string;
  door_num?: number;
  fw_ver?: string;
  led_brightness?: number;
  router_rssi?: number;
  server_monitor?: boolean;
  data?: {
    door1?: DoorStatus;
    door2?: DoorStatus;
    door3?: DoorStatus;
  };
  info?: string;
}

export interface TailwindCommandResponse {
  result: 'OK' | 'Fail';
  info?: string;
}

export type NotifyEvent = 'open' | 'close' | 'lock' | 'enable' | 'disable' | 'reboot';

export interface TailwindNotificationPayload extends TailwindStatusResponse {
  notify?: {
    door_idx: number;
    event: NotifyEvent;
  };
}

interface TailwindCommand {
  version: '0.1';
  product?: 'iQ3';
  data: {
    type: 'get' | 'set';
    name: string;
    value?: Record<string, unknown>;
  };
}

export class TailwindClient {
  private readonly localKey: string;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  constructor(localKey: string) {
    this.localKey = localKey;
  }

  /**
   * Get device status including door states
   */
  public async getDeviceStatus(host: string): Promise<TailwindStatusResponse> {
    const command: TailwindCommand = {
      version: '0.1',
      data: {
        type: 'get',
        name: 'dev_st',
      },
    };
    return this.makeRequest(host, command) as Promise<TailwindStatusResponse>;
  }

  /**
   * Control a door (open or close)
   */
  public async controlDoor(
    host: string,
    doorIdx: number,
    cmd: 'open' | 'close',
  ): Promise<TailwindCommandResponse> {
    const command: TailwindCommand = {
      version: '0.1',
      product: 'iQ3',
      data: {
        type: 'set',
        name: 'door_op',
        value: {
          door_idx: doorIdx,
          cmd,
        },
      },
    };
    return this.makeRequest(host, command) as Promise<TailwindCommandResponse>;
  }

  /**
   * Register a notification URL with the controller
   */
  public async registerNotifyUrl(host: string, url: string): Promise<TailwindCommandResponse> {
    const command: TailwindCommand = {
      version: '0.1',
      product: 'iQ3',
      data: {
        type: 'set',
        name: 'notify_url',
        value: {
          enable: 1,
          proto: 'http',
          url,
        },
      },
    };
    return this.makeRequest(host, command) as Promise<TailwindCommandResponse>;
  }

  /**
   * Unregister notifications from the controller
   */
  public async unregisterNotifyUrl(host: string): Promise<TailwindCommandResponse> {
    const command: TailwindCommand = {
      version: '0.1',
      product: 'iQ3',
      data: {
        type: 'set',
        name: 'notify_url',
        value: {
          enable: 0,
        },
      },
    };
    return this.makeRequest(host, command) as Promise<TailwindCommandResponse>;
  }

  /**
   * Send HTTP request to the Tailwind device with retry logic
   */
  private async makeRequest(
    host: string,
    command: TailwindCommand,
  ): Promise<TailwindStatusResponse | TailwindCommandResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const url = `http://${host}/json`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            TOKEN: this.localKey,
          },
          body: JSON.stringify(command),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = (await response.json()) as TailwindStatusResponse | TailwindCommandResponse;

        if (data.result === 'Fail') {
          throw new Error(data.info || 'Unknown API error');
        }

        return data;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.MAX_RETRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.RETRY_DELAY * Math.pow(2, attempt)),
          );
        }
      }
    }

    throw lastError || new Error('Failed to send command after retries');
  }
}
