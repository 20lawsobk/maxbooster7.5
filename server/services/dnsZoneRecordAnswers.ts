import { isIP } from "node:net";
import { domainToASCII } from "node:url";

export interface StoredDnsZoneRecord {
  value: string;
  ttl: number | null;
  priority?: number | null;
  weight?: number | null;
  port?: number | null;
}

export interface AddressAnswer {
  name: string;
  value: string;
  ttl: number;
}

export interface ServiceAnswer extends AddressAnswer {
  priority: number;
  weight: number;
  port: number;
}

export interface DnsAnswerMapping<T> {
  answers: T[];
  invalidRecord: boolean;
}

function normalizeTtl(ttl: number | null): number | null {
  if (ttl === null) return 300;
  return Number.isInteger(ttl) && ttl >= 0 && ttl <= 0x7fffffff
    ? ttl
    : null;
}

export function isValidIpv4Address(value: string): boolean {
  return isIP(value) === 4;
}

export function isValidSrvTarget(value: string): boolean {
  return normalizeSrvTarget(value) !== null;
}

function normalizeSrvTarget(value: string): string | null {
  if (value === ".") return ".";
  const withoutRootDot = value.endsWith(".") ? value.slice(0, -1) : value;
  const ascii = domainToASCII(withoutRootDot).toLowerCase();
  if (!ascii || ascii.length > 253) return null;
  const valid = ascii.split(".").every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
  return valid ? ascii : null;
}

export function mapAZoneRecords(
  queryName: string,
  records: StoredDnsZoneRecord[],
): DnsAnswerMapping<AddressAnswer> {
  const answers: AddressAnswer[] = [];
  let invalidRecord = false;

  for (const record of records) {
    const ttl = normalizeTtl(record.ttl);
    if (!isValidIpv4Address(record.value) || ttl === null) {
      invalidRecord = true;
      continue;
    }
    answers.push({
      name: queryName,
      value: record.value,
      ttl,
    });
  }

  return { answers, invalidRecord };
}

export function mapSrvZoneRecords(
  queryName: string,
  records: StoredDnsZoneRecord[],
): DnsAnswerMapping<ServiceAnswer> {
  const answers: ServiceAnswer[] = [];
  let invalidRecord = false;

  for (const record of records) {
    const { priority, weight, port } = record;
    const target = normalizeSrvTarget(record.value);
    const ttl = normalizeTtl(record.ttl);
    if (
      target === null ||
      ttl === null ||
      !Number.isInteger(priority) ||
      priority! < 0 ||
      priority! > 0xffff ||
      !Number.isInteger(weight) ||
      weight! < 0 ||
      weight! > 0xffff ||
      !Number.isInteger(port) ||
      port! < 0 ||
      port! > 0xffff
    ) {
      invalidRecord = true;
      continue;
    }

    answers.push({
      name: queryName,
      value: target,
      ttl,
      priority: priority!,
      weight: weight!,
      port: port!,
    });
  }

  return { answers, invalidRecord };
}
