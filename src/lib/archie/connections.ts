// =========================================================
// FRELUX ARCHIE — CONNECTED DEVICE, HOUSEHOLD & ACCOUNT
// INTELLIGENCE (PWA RUNTIME)
// src/lib/archie/connections.ts
//
// The REAL browser runtime for the connective-tissue
// subsystem. Every transport here is a real platform API —
// no fake integrations, no simulated control:
//
//   * Web Bluetooth  (navigator.bluetooth)  — real GATT
//     pairing through the browser's own permission prompt
//   * WebUSB         (navigator.usb)        — real USB
//     device selection through the OS/browser prompt
//   * Network probe  (fetch + timeout)     — honest
//     reachable / unreachable / protocol-error results
//
// The browser's pairing prompt IS the pairing requirement —
// ARCHIE never bypasses it and never auto-connects.
// Connectivity is NEVER authorization: a successful probe
// only produces a DISCOVERED candidate; the owner explicitly
// grants permissions and access scope, and every action is
// evaluated by the deterministic core
// (@studio-shared/archie-ai/native-engine/connections.ts)
// and audited to frelux_archie_connection_events.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";
import {
  authorizeDeviceAction,
  connectivityIsAuthorization,
  maintenanceDecision,
  normalizePermissions,
  pairingTransition,
  shapeAuditRow,
  CONNECTION_STATUSES,
  CONNECTION_TRANSPORTS,
  DEVICE_KINDS,
  DEVICE_PERMISSIONS,
  type AccessScope,
  type Actor,
  type ConnectionAuditRow,
  type ConnectionEventResult,
  type ConnectionStatus,
  type ConnectionTransport,
  type DeviceKind,
  type DevicePermission,
  type DeviceUpdate,
  type AuthorizationDecision,
} from "@studio-shared/archie-ai/native-engine/connections.ts";

export {
  CONNECTION_STATUSES,
  CONNECTION_TRANSPORTS,
  DEVICE_KINDS,
  DEVICE_PERMISSIONS,
  authorizeDeviceAction,
  connectivityIsAuthorization,
  maintenanceDecision,
  normalizePermissions,
  pairingTransition,
};
export type {
  AccessScope,
  ConnectionEventResult,
  ConnectionStatus,
  ConnectionTransport,
  DeviceKind,
  DevicePermission,
  DeviceUpdate,
};

// ---------------------------------------------------------
// 1. HONEST CAPABILITY DETECTION
//    The PWA reports exactly what this browser can do —
//    never claims a transport it does not have.
// ---------------------------------------------------------
export interface ConnectivityCapabilities {
  bluetooth: boolean;
  usb: boolean;
  network: boolean;
  /** Media Session control of THIS device's playback (the
   *  only "media control" a browser really exposes). */
  mediaSession: boolean;
  /** Browsers cannot control system volume — reported
   *  honestly as unavailable. */
  systemVolume: false;
}

export function detectConnectivityCapabilities(): ConnectivityCapabilities {
  return {
    bluetooth: typeof navigator.bluetooth?.requestDevice === "function",
    usb: typeof navigator.usb?.requestDevice === "function",
    network: typeof fetch === "function",
    mediaSession: "mediaSession" in navigator,
    // A browser cannot control system volume — always honest.
    systemVolume: false,
  };
}

// ---------------------------------------------------------
// 2. TYPED HONEST FAILURES
// ---------------------------------------------------------
export type ConnectionFailureReason =
  | "unsupported"
  | "user-denied"
  | "device-not-found"
  | "gatt-error"
  | "usb-error"
  | "network-unreachable"
  | "protocol-error"
  | "not-authenticated"
  | "denied"
  | "error";

export class ConnectionFailure extends Error {
  readonly reason: ConnectionFailureReason;
  constructor(reason: ConnectionFailureReason, message: string) {
    super(message);
    this.name = "ConnectionFailure";
    this.reason = reason;
  }
}

// ---------------------------------------------------------
// 3. DATA SHAPES (rows of the connection registry)
// ---------------------------------------------------------
export interface ConnectedDeviceRow {
  id: string;
  owner_id: string;
  person_id: string | null;
  trusted_device_id: string | null;
  transport: ConnectionTransport;
  device_name: string;
  device_kind: DeviceKind;
  manufacturer: string | null;
  model: string | null;
  status: ConnectionStatus;
  transport_address: Record<string, unknown>;
  permissions: DevicePermission[];
  access_scope: AccessScope;
  last_seen_at: string;
  created_date: string;
  updated_date: string;
}

export interface DeviceAccountRow {
  id: string;
  connection_id: string;
  service_name: string;
  account_ref: string | null;
  account_kind: "streaming" | "smart-home" | "cloud" | "manufacturer" | "other";
  permissions: string[];
  status: "LINKED" | "UNLINKED";
  created_date: string;
}

export interface ConnectionEventRow {
  id: string;
  connection_id: string;
  actor_type: Actor["type"];
  action: string;
  result: ConnectionEventResult;
  detail: Record<string, unknown>;
  verified: boolean;
  created_date: string;
}

export interface DeviceHealthRow {
  id: string;
  connection_id: string;
  connectivity: "online" | "offline" | "degraded" | "unknown";
  battery_pct: number | null;
  health: "healthy" | "degraded" | "error" | "unknown";
  capabilities: string[];
  firmware_version: string | null;
  firmware_verified: boolean;
  checked_at: string;
}

/** A device candidate discovered through a REAL transport
 *  probe. This is not a connection and grants nothing. */
export interface DeviceCandidate {
  transport: ConnectionTransport;
  device_name: string;
  device_kind: DeviceKind;
  manufacturer: string | null;
  model: string | null;
  transport_address: Record<string, unknown>;
  /** Real values read from the device, when the protocol
   *  exposes them (BLE battery/device-information services). */
  battery_pct: number | null;
  capabilities: string[];
}

// Standard Bluetooth GATT services ARCHIE can read real
// values from (Battery Service, Device Information Service).
const BLE_BATTERY_SERVICE = 0x180f;
const BLE_BATTERY_LEVEL = 0x2a19;
const BLE_DEVICE_INFO_SERVICE = 0x180a;
const BLE_MANUFACTURER = 0x2a29;
const BLE_MODEL = 0x2a24;
const BLE_SERIAL = 0x2a25;

async function readGattString(
  server: BluetoothRemoteGATTServer,
  service: number,
  characteristic: number,
): Promise<string | null> {
  try {
    const value = await server
      .getPrimaryService(service)
      .then((s) => s.getCharacteristic(characteristic))
      .then((c) => c.readValue());
    return new TextDecoder().decode(value);
  } catch {
    return null; // service/characteristic not exposed — honest
  }
}

async function readGattBattery(
  server: BluetoothRemoteGATTServer,
): Promise<number | null> {
  try {
    const value = await server
      .getPrimaryService(BLE_BATTERY_SERVICE)
      .then((s) => s.getCharacteristic(BLE_BATTERY_LEVEL))
      .then((c) => c.readValue());
    return value.getUint8(0);
  } catch {
    return null;
  }
}

/** Real Web Bluetooth pairing — the browser's chooser and
 *  permission prompt decide; ARCHIE never bypasses it. */
export async function pairBluetoothDevice(
  filters: BluetoothLEScanFilter[] = [],
): Promise<DeviceCandidate> {
  const caps = detectConnectivityCapabilities();
  if (!caps.bluetooth) {
    throw new ConnectionFailure(
      "unsupported",
      "This browser does not support Web Bluetooth.",
    );
  }
  if (!navigator.bluetooth) {
    // Runtime narrowing (TS18048) — support was already checked.
    throw new ConnectionFailure(
      "unsupported",
      "Web Bluetooth is not available in this browser.",
    );
  }
  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: filters.length > 0 ? filters : [{ namePrefix: "" }],
      optionalServices: [BLE_BATTERY_SERVICE, BLE_DEVICE_INFO_SERVICE],
    });
  } catch (e) {
    throw new ConnectionFailure(
      "user-denied",
      e instanceof Error
        ? e.message
        : "No device was selected in the browser pairing prompt.",
    );
  }
  if (!device.gatt) {
    throw new ConnectionFailure(
      "gatt-error",
      `Device "${device.name ?? "unknown"}" exposes no GATT server.`,
    );
  }
  let server: BluetoothRemoteGATTServer;
  try {
    server = await device.gatt.connect();
  } catch (e) {
    throw new ConnectionFailure(
      "gatt-error",
      e instanceof Error ? e.message : "GATT connection failed.",
    );
  }
  const [manufacturer, model, serial, battery] = await Promise.all([
    readGattString(server, BLE_DEVICE_INFO_SERVICE, BLE_MANUFACTURER),
    readGattString(server, BLE_DEVICE_INFO_SERVICE, BLE_MODEL),
    readGattString(server, BLE_DEVICE_INFO_SERVICE, BLE_SERIAL),
    readGattBattery(server),
  ]);
  const capabilities: string[] = [];
  if (battery !== null) capabilities.push("battery-level");
  if (manufacturer !== null) capabilities.push("device-information");
  try {
    server.disconnect();
  } catch {
    // best effort — the candidate is already captured
  }
  return {
    transport: "bluetooth",
    device_name: device.name ?? "Unnamed BLE device",
    device_kind: "other",
    manufacturer,
    model,
    transport_address: {
      ble_device_id: device.id,
      ...(serial !== null ? { serial } : {}),
    },
    battery_pct: battery,
    capabilities,
  };
}

/** Real WebUSB pairing — the browser's permission prompt
 *  decides; ARCHIE never bypasses it. */
export async function pairUsbDevice(
  filters: USBDeviceFilter[] = [],
): Promise<DeviceCandidate> {
  const caps = detectConnectivityCapabilities();
  if (!caps.usb) {
    throw new ConnectionFailure(
      "unsupported",
      "This browser does not support WebUSB.",
    );
  }
  if (!navigator.usb) {
    throw new ConnectionFailure(
      "unsupported",
      "WebUSB is not available in this browser.",
    );
  }
  let device: USBDevice;
  try {
    device = await navigator.usb.requestDevice({ filters });
  } catch (e) {
    throw new ConnectionFailure(
      "user-denied",
      e instanceof Error
        ? e.message
        : "No USB device was selected in the browser prompt.",
    );
  }
  let opened = false;
  try {
    await device.open();
    await device.selectConfiguration(1);
    opened = true;
  } catch {
    // Some devices cannot be opened without claiming an
    // interface — the identity is still real and honest.
  }
  const manufacturer = device.manufacturerName ?? null;
  const model = device.productName ?? null;
  const usbCaps: string[] = ["usb"];
  if (opened) usbCaps.push("opened");
  try {
    if (opened) await device.close();
  } catch {
    // best effort
  }
  return {
    transport: "usb",
    device_name: model ?? "Unnamed USB device",
    device_kind: "other",
    manufacturer,
    model,
    transport_address: {
      usb_vendor_id: device.vendorId,
      usb_product_id: device.productId,
    },
    battery_pct: null,
    capabilities: usbCaps,
  };
}

/** Honest network reachability probe. Reports exactly what
 *  happened — reachable, unreachable, or a protocol error.
 *  Never fabricates a device from an endpoint. */
export async function probeNetworkEndpoint(
  url: string,
  timeoutMs = 4000,
): Promise<
  | { reachable: true; status: number }
  | {
      reachable: false;
      reason: "network-unreachable" | "protocol-error";
      message: string;
    }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      mode: "no-cors",
      signal: controller.signal,
    });
    // no-cors: opaque response — reachability only, no content claims
    return { reachable: true, status: res.type === "opaque" ? 0 : res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (controller.signal.aborted) {
      return {
        reachable: false,
        reason: "network-unreachable",
        message: `No response within ${timeoutMs}ms: ${msg}`,
      };
    }
    // In no-cors mode a TypeError ("Failed to fetch") means the
    // endpoint did not answer (unreachable or blocked) — reported
    // honestly, never fabricated as reachable.
    return {
      reachable: false,
      reason: "network-unreachable",
      message: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------
// 4. REGISTRY PERSISTENCE (RLS: owner-only writes)
// ---------------------------------------------------------

async function requireUserId(): Promise<string> {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    throw new ConnectionFailure("not-authenticated", "Sign in first.");
  }
  return user.id;
}

export interface SaveConnectionInput {
  candidate: DeviceCandidate;
  personId?: string | null;
  /** Anything non-canonical is dropped by the normalizer —
   *  only real grants are stored. */
  permissions: string[];
  accessScope?: AccessScope;
}

/** Persist a paired candidate as a connection with an
 *  EXPLICIT permission grant. The candidate came from a real
 *  transport probe; connectivity grants nothing by itself. */
export async function saveConnection(
  input: SaveConnectionInput,
): Promise<ConnectedDeviceRow> {
  const ownerId = await requireUserId();
  const supabase = await getSupabase();
  const row = {
    owner_id: ownerId,
    person_id: input.personId ?? null,
    transport: input.candidate.transport,
    device_name: input.candidate.device_name,
    device_kind: input.candidate.device_kind,
    manufacturer: input.candidate.manufacturer,
    model: input.candidate.model,
    status: "PAIRED" as ConnectionStatus,
    transport_address: input.candidate.transport_address,
    permissions: normalizePermissions(input.permissions),
    access_scope: input.accessScope ?? { actions: [], windows: [] },
  };
  const { data, error } = await supabase
    .from("frelux_archie_connections")
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    throw new ConnectionFailure("error", error?.message ?? "Insert failed");
  }
  await auditConnection(data.id, ownerId, {
    actor: { type: "owner", userId: ownerId },
    action: "pair",
    request: {
      transport: input.candidate.transport,
      transport_address: input.candidate.transport_address,
    },
    result: "success",
    detail: {
      permissions: row.permissions,
      access_scope: row.access_scope,
      capabilities: input.candidate.capabilities,
    },
    verified: true,
  });
  return data as ConnectedDeviceRow;
}

export async function listConnections(): Promise<ConnectedDeviceRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_connections")
    .select("*")
    .order("updated_date", { ascending: false });
  if (error) throw new ConnectionFailure("error", error.message);
  return (data ?? []) as ConnectedDeviceRow[];
}

export async function listConnectionEvents(
  connectionId: string,
  limit = 25,
): Promise<ConnectionEventRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_connection_events")
    .select(
      "id, connection_id, actor_type, action, result, detail, verified, created_date",
    )
    .eq("connection_id", connectionId)
    .order("created_date", { ascending: false })
    .limit(limit);
  if (error) throw new ConnectionFailure("error", error.message);
  return (data ?? []) as ConnectionEventRow[];
}

export async function listDeviceAccounts(
  connectionId: string,
): Promise<DeviceAccountRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_device_accounts")
    .select(
      "id, connection_id, service_name, account_ref, account_kind, permissions, status, created_date",
    )
    .eq("connection_id", connectionId)
    .order("created_date", { ascending: false });
  if (error) throw new ConnectionFailure("error", error.message);
  return (data ?? []) as DeviceAccountRow[];
}

export async function listDeviceHealth(
  connectionId: string,
  limit = 5,
): Promise<DeviceHealthRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_device_health")
    .select("*")
    .eq("connection_id", connectionId)
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error) throw new ConnectionFailure("error", error.message);
  return (data ?? []) as DeviceHealthRow[];
}

/** Lifecycle change through the deterministic state machine.
 *  Invalid transitions are refused and audited as denials —
 *  never silently applied. */
export async function transitionConnection(
  connection: ConnectedDeviceRow,
  event: Parameters<typeof pairingTransition>[1],
): Promise<ConnectedDeviceRow> {
  const ownerId = await requireUserId();
  const { ok, to } = pairingTransition(connection.status, event);
  if (!ok) {
    await auditConnection(connection.id, ownerId, {
      actor: { type: "owner", userId: ownerId },
      action: `transition:${event}`,
      request: { from: connection.status },
      result: "denied",
      detail: { reason: `invalid transition from ${connection.status}` },
      verified: false,
    });
    throw new ConnectionFailure(
      "denied",
      `Cannot ${event.replace("-", " ")} a connection that is ${connection.status}.`,
    );
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("frelux_archie_connections")
    .update({ status: to, updated_date: new Date().toISOString() })
    .eq("id", connection.id)
    .select()
    .single();
  if (error || !data) {
    throw new ConnectionFailure("error", error?.message ?? "Update failed");
  }
  await auditConnection(connection.id, ownerId, {
    actor: { type: "owner", userId: ownerId },
    action: `transition:${event}`,
    request: { from: connection.status },
    result: "success",
    detail: { to },
    verified: true,
  });
  return data as ConnectedDeviceRow;
}

/** Change the permission grant of a connection. Only the
 *  Owner can grant or withdraw permissions. */
export async function grantPermissions(
  connection: ConnectedDeviceRow,
  permissions: string[],
  accessScope?: AccessScope,
): Promise<ConnectedDeviceRow> {
  const ownerId = await requireUserId();
  const supabase = await getSupabase();
  const next = normalizePermissions(permissions);
  const patch: Record<string, unknown> = {
    permissions: next,
    updated_date: new Date().toISOString(),
  };
  if (accessScope) patch.access_scope = accessScope;
  const { data, error } = await supabase
    .from("frelux_archie_connections")
    .update(patch)
    .eq("id", connection.id)
    .select()
    .single();
  if (error || !data) {
    throw new ConnectionFailure("error", error?.message ?? "Update failed");
  }
  await auditConnection(connection.id, ownerId, {
    actor: { type: "owner", userId: ownerId },
    action: "grant-permissions",
    request: { permissions: next },
    result: "success",
    detail: { permissions: next, access_scope: data.access_scope },
    verified: true,
  });
  return data as ConnectedDeviceRow;
}

/** Save a real health snapshot (values read from the device
 *  — never fabricated). */
export async function saveHealthSnapshot(
  connectionId: string,
  snapshot: Omit<DeviceHealthRow, "id" | "connection_id" | "checked_at">,
): Promise<void> {
  const ownerId = await requireUserId();
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("frelux_archie_device_health")
    .insert({ ...snapshot, connection_id: connectionId, owner_id: ownerId });
  if (error) throw new ConnectionFailure("error", error.message);
  await auditConnection(connectionId, ownerId, {
    actor: { type: "archie", userId: ownerId },
    action: "health-snapshot",
    request: { connectivity: snapshot.connectivity },
    result: "success",
    detail: {
      battery_pct: snapshot.battery_pct,
      health: snapshot.health,
      firmware_version: snapshot.firmware_version,
    },
    verified: true,
  });
}

/** Audit one action on one connection — success, failure or
 *  denial. Denials are recorded exactly like successes. */
export async function auditConnection(
  connectionId: string,
  ownerId: string,
  input: {
    actor: Actor;
    action: string;
    request: Record<string, unknown>;
    result: ConnectionEventResult;
    detail: Record<string, unknown>;
    verified: boolean;
  },
): Promise<void> {
  const row: ConnectionAuditRow = shapeAuditRow({
    connectionId,
    ownerId,
    ...input,
  });
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("frelux_archie_connection_events")
    .insert(row);
  if (error) throw new ConnectionFailure("error", error.message);
}

/** The evaluated-action pipeline used by the PWA UI:
 *  CONNECTION → PAIRING STATE → PERMISSION SCOPE → DECISION →
 *  AUDIT. A denial is returned, never faked as success. */
export async function evaluateDeviceAction(
  connection: ConnectedDeviceRow,
  actor: Actor,
  permission: DevicePermission,
  opts: { action?: string; at?: Date } = {},
): Promise<AuthorizationDecision> {
  const ownerId = await requireUserId();
  const decision = authorizeDeviceAction(connection, actor, permission, opts);
  await auditConnection(connection.id, ownerId, {
    actor,
    action: opts.action ?? permission,
    request: {
      permission,
      action: opts.action ?? null,
      transport: connection.transport,
    },
    result: decision.authorized ? "success" : "denied",
    detail: { reason: decision.reason },
    verified: decision.authorized,
  });
  return decision;
}
