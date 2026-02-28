import { EventEmitter } from 'events';

interface IHomeyDevice {
  log(...args: any[]): void;
  error(...args: any[]): void;
  getStoreValue(key: string): any;
  setStoreValue(key: string, value: any): Promise<void>;
  setCapabilityValue(capabilityId: string, value: any): Promise<void>;
  registerCapabilityListener(capabilityId: string, callback: Function): Promise<void>;
  setCapabilityOptions(capabilityId: string, options: any): Promise<void>;
  setAvailable(): Promise<void>;
  setUnavailable(reason?: string): Promise<void>;
  homey: IHomey;
}

interface IHomeyDriver {
  log(...args: any[]): void;
  error(...args: any[]): void;
  homey: IHomey;
}

interface IHomeyFlow {
  getDeviceTriggerCard(id: string): {
    trigger: (device: IHomeyDevice, tokens?: any, state?: any) => Promise<void>;
  };
  getConditionCard(id: string): {
    registerRunListener: (listener: (args: any, state: any) => Promise<boolean> | boolean) => void;
  };
  getActionCard(id: string): {
    registerRunListener: (listener: (args: any, state: any) => Promise<void> | void) => void;
  };
}

interface IHomeySettings {
  get(key: string): any;
  set(key: string, value: any): Promise<void>;
}

interface IHomeyApi {
  getLocalUrl(): Promise<string>;
  realtime(event: string, data: any): void;
}

interface IHomeyCloud {
  getLocalAddress(): Promise<string>;
}

interface IHomey {
  flow: IHomeyFlow;
  settings: IHomeySettings;
  api: IHomeyApi;
  cloud: IHomeyCloud;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any;
  log(...args: any[]): void;
  error(...args: any[]): void;
  on(event: string, callback: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): boolean;
}

class MockDevice extends EventEmitter implements IHomeyDevice {
  log = jest.fn();
  error = jest.fn();
  getStore = jest.fn().mockReturnValue({});
  getStoreValue = jest.fn();
  setStoreValue = jest.fn().mockResolvedValue(undefined);
  setCapabilityValue = jest.fn().mockResolvedValue(undefined);
  registerCapabilityListener = jest.fn().mockResolvedValue(undefined);
  setCapabilityOptions = jest.fn().mockResolvedValue(undefined);
  setAvailable = jest.fn().mockResolvedValue(undefined);
  setUnavailable = jest.fn().mockResolvedValue(undefined);
  homey: MockHomey;

  constructor(homey: MockHomey) {
    super();
    this.homey = homey;
  }
}

class MockDriver extends EventEmitter implements IHomeyDriver {
  log = jest.fn();
  error = jest.fn();
  homey: MockHomey;

  constructor(homey: MockHomey) {
    super();
    this.homey = homey;
  }
}

class MockFlow implements IHomeyFlow {
  getDeviceTriggerCard = jest.fn().mockReturnValue({
    trigger: jest.fn().mockResolvedValue(undefined),
  });
  getConditionCard = jest.fn().mockReturnValue({
    registerRunListener: jest.fn(),
  });
  getActionCard = jest.fn().mockReturnValue({
    registerRunListener: jest.fn(),
  });
}

class MockSettings implements IHomeySettings {
  store: { [key: string]: any } = {};

  get = jest.fn().mockImplementation((key: string) => this.store[key]);
  set = jest.fn().mockImplementation((key: string, value: any) => {
    this.store[key] = value;
    return Promise.resolve();
  });
}

class MockApi implements IHomeyApi {
  getLocalUrl = jest.fn().mockResolvedValue('http://192.168.1.50');
  realtime = jest.fn();
}

class MockCloud implements IHomeyCloud {
  getLocalAddress = jest.fn().mockResolvedValue('192.168.1.50');
}

export class MockHomey extends EventEmitter implements IHomey {
  flow = new MockFlow();
  settings = new MockSettings();
  api = new MockApi();
  cloud = new MockCloud();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any = {};
  log = jest.fn();
  error = jest.fn();
  setTimeout = jest
    .fn()
    .mockImplementation((fn: () => void, ms: number) => global.setTimeout(fn, ms));
  clearTimeout = jest.fn().mockImplementation((id: NodeJS.Timeout) => global.clearTimeout(id));

  constructor() {
    super();
    this.on = jest.fn().mockImplementation((event: string, callback: (...args: any[]) => void) => {
      super.on(event, callback);
      return this;
    });
    this.emit = jest.fn().mockImplementation((event: string, ...args: any[]) => {
      return super.emit(event, ...args);
    });
  }
}

class MockApp {
  log = jest.fn();
  error = jest.fn();
  homey: MockHomey;

  constructor(homey: MockHomey) {
    this.homey = homey;
  }
}

const Homey = {
  App: MockApp,
  Device: MockDevice,
  Driver: MockDriver,
  manifest: {
    id: 'com.dn.tailwind',
    version: '1.0.0',
  },
};

export default Homey;
