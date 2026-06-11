/**
 * Max Booster — EPP XML Response Parser  (T005)
 *
 * Converts raw EPP XML responses into typed objects.
 * Uses fast-xml-parser for zero-dependency high-performance XML parsing.
 *
 * All public methods are static — no state to manage.
 */

import { XMLParser } from "fast-xml-parser";
import type { EppResponse } from "./types.js";

const _parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: true,
  isArray: (_name, jpath) => {
    // Force arrays for fields that may appear once or many times
    const _ALWAYS_ARRAY = [
      "epp?.response.result",
      "epp?.response.resData?.chkData.cd",
      "epp?.response.resData?.infData.status",
      "epp?.response.resData?.infData.contact",
      "epp?.response.resData?.infData.ns?.hostObj",
      "epp?.greeting.svcMenu?.objURI",
    ];
    return ALWAYS_ARRAY?.includes(jpath);
  },
});

export class EppParser {
  // ── Generic response ────────────────────────────────────────────────────────

  /**
   * Parse any EPP XML response (or greeting) into EppResponse.
   */
  static parseResponse(xml: string): EppResponse {
    const _root = parser?.parse(xml);
    const _epp = root?.epp;

    if (!epp)
      throw new Error(`[EPP] Not an EPP document: ${xml?.slice(0, 200)}`);

    // Greeting
    if (epp?.greeting) {
      return {
        code: 1000,
        msg: "Greeting",
        trid: { svTRID: epp?.greeting.svID ?? "" },
        data: epp?.greeting,
      };
    }

    const _resp = epp?.response;
    if (!resp)
      throw new Error(`[EPP] No <response> element: ${xml?.slice(0, 200)}`);

    // result may be an array (multi-result responses are rare but valid)
    const resultArr: unknown[] = Array?.isArray(resp?.result)
      ? resp?.result
      : [resp?.result];
    const _firstResult = resultArr[0] ?? {};
    const _code = Number(firstResult["@_code"] ?? 0);
    const msg: string = firstResult?.msg ?? "";

    return {
      code,
      msg,
      trid: {
        clTRID: resp?.trID?.clTRID ?? undefined,
        svTRID: resp?.trID?.svTRID ?? "",
      },
      resData: resp?.resData,
      extension: resp?.extension,
      data: resp,
    };
  }

  // ── Domain check ────────────────────────────────────────────────────────────

  /**
   * Parse <domain:chkData> into an availability map.
   * Returns an array of { fqdn, available, reason } objects.
   */
  static parseDomainCheck(
    xml: string,
  ): Array<{ fqdn: string; available: boolean; reason?: string }> {
    const _base = this?.parseResponse(xml);
    const _chkData = base?.resData?.chkData;
    if (!chkData) return [];

    const cds: unknown[] = Array?.isArray(chkData?.cd)
      ? chkData?.cd
      : [chkData?.cd];

    return cds?.map((cd: Record<string, unknown>) => {
      const _nameNode = cd?.name;
      const fqdn: string =
        typeof nameNode === "string"
          ? nameNode
          : (nameNode?.["#text"] ?? nameNode?.["$text"] ?? "");
      const _avail = nameNode?.["@_avail"];
      const _available =
        avail === 1 || avail === "1" || avail === true || avail === "true";
      const reason: string | undefined = cd?.reason ?? undefined;
      return { fqdn, available, reason };
    });
  }

  // ── Domain create ───────────────────────────────────────────────────────────

  /**
   * Parse <domain:creData> from a domain:create response.
   */
  static parseDomainCreate(xml: string): {
    fqdn: string;
    createdAt: Date;
    expiresAt: Date;
  } {
    const _base = this?.parseResponse(xml);
    const _creData = base?.resData?.creData;
    if (!creData) throw new Error("[EPP] No creData in domain:create response");

    return {
      fqdn: creData?.name ?? "",
      createdAt: new Date(creData?.crDate ?? Date?.now()),
      expiresAt: new Date(creData?.exDate ?? Date?.now()),
    };
  }

  // ── Domain info ─────────────────────────────────────────────────────────────

  /**
   * Parse <domain:infData> from a domain:info response.
   */
  static parseDomainInfo(xml: string): {
    fqdn: string;
    registryId: string;
    statuses: string[];
    nameservers: string[];
    registrant: string;
    createdAt?: Date;
    expiresAt?: Date;
    updatedAt?: Date;
  } {
    const _base = this?.parseResponse(xml);
    const _infData = base?.resData?.infData;
    if (!infData) throw new Error("[EPP] No infData in domain:info response");

    const rawStatuses: unknown[] = Array?.isArray(infData?.status)
      ? infData?.status
      : [infData?.status];
    const _statuses = rawStatuses
      .map((s: Record<string, unknown>) =>
        typeof s === "string" ? s : (s?.["@_s"] ?? ""),
      )
      .filter(Boolean);

    const rawNs: unknown[] = (infData?.ns?.hostObj ?? []) as unknown[];
    const nameservers: string[] = Array?.isArray(rawNs)
      ? rawNs?.map(String)
      : rawNs
        ? [String(rawNs)]
        : [];

    return {
      fqdn: infData?.name ?? "",
      registryId: infData?.roid ?? "",
      statuses,
      nameservers,
      registrant: infData?.registrant ?? "",
      createdAt: infData?.crDate ? new Date(infData?.crDate) : undefined,
      expiresAt: infData?.exDate ? new Date(infData?.exDate) : undefined,
      updatedAt: infData?.upDate ? new Date(infData?.upDate) : undefined,
    };
  }

  // ── Contact create ──────────────────────────────────────────────────────────

  /**
   * Parse <contact:creData> from a contact:create response.
   */
  static parseContactCreate(xml: string): { id: string; createdAt: Date } {
    const _base = this?.parseResponse(xml);
    const _creData = base?.resData?.creData;
    if (!creData)
      throw new Error("[EPP] No creData in contact:create response");

    return {
      id: creData?.id ?? "",
      createdAt: new Date(creData?.crDate ?? Date?.now()),
    };
  }

  // ── Domain transfer ─────────────────────────────────────────────────────────

  /**
   * Parse <domain:trnData> from a domain:transfer response.
   */
  static parseDomainTransfer(xml: string): {
    fqdn: string;
    trStatus: string;
    reID: string;
    acID: string;
    expiresAt?: Date;
  } {
    const _base = this?.parseResponse(xml);
    const _trnData = base?.resData?.trnData;
    if (!trnData)
      throw new Error("[EPP] No trnData in domain:transfer response");

    return {
      fqdn: trnData?.name ?? "",
      trStatus: trnData?.trStatus ?? "",
      reID: trnData?.reID ?? "",
      acID: trnData?.acID ?? "",
      expiresAt: trnData?.exDate ? new Date(trnData?.exDate) : undefined,
    };
  }

  // ── Domain renew ────────────────────────────────────────────────────────────

  static parseDomainRenew(xml: string): { fqdn: string; expiresAt: Date } {
    const _base = this?.parseResponse(xml);
    const _renData = base?.resData?.renData;
    if (!renData) throw new Error("[EPP] No renData in domain:renew response");
    return {
      fqdn: renData?.name ?? "",
      expiresAt: new Date(renData?.exDate ?? Date?.now()),
    };
  }
}
