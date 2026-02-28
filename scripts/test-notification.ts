#!/usr/bin/env npx ts-node
/**
 * Send a test notification to the Homey Tailwind app API endpoint.
 * Simulates what the Tailwind controller would POST when a door event occurs.
 *
 * Usage:
 *   npx ts-node scripts/test-notification.ts --homey-url http://192.168.1.50 --host tailwind-abc.local --event open --door 0
 *   npx ts-node scripts/test-notification.ts --homey-url http://192.168.1.50 --host tailwind-abc.local --event close --door 1
 *   npx ts-node scripts/test-notification.ts --homey-url http://192.168.1.50 --host tailwind-abc.local --event reboot
 */

const EVENTS = ['open', 'close', 'lock', 'enable', 'disable', 'reboot'] as const;
type NotifyEvent = (typeof EVENTS)[number];

interface DoorStatus {
  index: number;
  status: 'open' | 'close';
  lockup: number;
  disabled: number;
}

interface Args {
  homeyUrl: string;
  host: string;
  event: NotifyEvent;
  door: number;
  devId: string;
  status?: 'open' | 'close';
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let homeyUrl = '';
  let host = '';
  let event: NotifyEvent = 'open';
  let door = 0;
  let devId = 'test_controller';
  let status: 'open' | 'close' | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--homey-url':
        homeyUrl = args[++i];
        break;
      case '--host':
        host = args[++i];
        break;
      case '--event':
        event = args[++i] as NotifyEvent;
        break;
      case '--door':
        door = parseInt(args[++i], 10);
        break;
      case '--dev-id':
        devId = args[++i];
        break;
      case '--status':
        status = args[++i] as 'open' | 'close';
        break;
      case '--help':
        console.log(`Usage: npx ts-node scripts/test-notification.ts [options]

Options:
  --homey-url <url>   Homey local URL (required, e.g. http://192.168.1.50)
  --host <hostname>   Controller hostname for routing (required, e.g. tailwind-abc.local)
  --event <event>     Event type: ${EVENTS.join(', ')} (default: open)
  --door <index>      Door index, 0-based (default: 0)
  --dev-id <id>       Controller device ID in payload (default: test_controller)
  --status <status>   Override door status: open or close (default: matches event)`);
        process.exit(0);
    }
  }

  if (!homeyUrl) {
    console.error('Error: --homey-url is required');
    process.exit(1);
  }

  if (!host) {
    console.error('Error: --host is required (controller hostname, e.g. tailwind-abc.local)');
    process.exit(1);
  }

  if (!EVENTS.includes(event)) {
    console.error(`Error: --event must be one of: ${EVENTS.join(', ')}`);
    process.exit(1);
  }

  return { homeyUrl, host, event, door, devId, status };
}

function buildPayload(args: Args) {
  const doorStatus = args.status ?? (args.event === 'close' ? 'close' : 'open');

  const doors: Record<string, DoorStatus> = {};
  for (let i = 0; i <= Math.max(args.door, 0); i++) {
    const key = `door${i + 1}`;
    doors[key] = {
      index: i,
      status: i === args.door ? doorStatus : 'close',
      lockup: 0,
      disabled: 0,
    };
  }

  return {
    result: 'OK',
    dev_id: args.devId,
    door_num: Object.keys(doors).length,
    data: doors,
    notify: {
      door_idx: args.door,
      event: args.event,
    },
  };
}

async function main() {
  const args = parseArgs();
  const payload = buildPayload(args);
  const url = `${args.homeyUrl.replace(/\/$/, '')}/api/app/com.dn.tailwind/notification?host=${encodeURIComponent(args.host)}`;

  console.log(`Sending ${args.event} notification for door ${args.door} to ${url}`);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    if (response.ok) {
      console.log(`Success (${response.status}):`, text);
    } else {
      console.error(`Failed (${response.status}):`, text);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error sending notification:', (error as Error).message);
    process.exit(1);
  }
}

main();
