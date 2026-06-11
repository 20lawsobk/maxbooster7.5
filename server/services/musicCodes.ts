import { logger } from "../logger.js";
import { getPdimClient } from "../lib/pdimClient.js";

export interface ISRCValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ISRCParsedResult {
  country: string;
  registrant: string;
  year: string;
  designation: string;
}

export interface UPCValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CodeGenerationResult {
  code: string;
  formatted: string;
  checkDigit?: string;
}

const _VALID_COUNTRY_CODES = [
  "US",
  "GB",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "BE",
  "AT",
  "CH",
  "SE",
  "NO",
  "DK",
  "FI",
  "AU",
  "NZ",
  "CA",
  "JP",
  "KR",
  "CN",
  "BR",
  "MX",
  "AR",
  "CL",
  "CO",
  "PE",
  "IN",
  "RU",
  "PL",
  "CZ",
  "HU",
  "RO",
  "BG",
  "GR",
  "PT",
  "IE",
  "ZA",
  "EG",
  "NG",
  "KE",
  "TH",
  "MY",
  "SG",
  "PH",
  "ID",
  "VN",
  "TW",
  "HK",
  "IL",
  "AE",
  "SA",
  "TR",
  "UA",
  "BY",
  "KZ",
  "QA",
  "QM",
  "QZ",
  "ZZ",
];

const GS1_PREFIXES: { [country: string]: string[] } = {
  US: [
    "000",
    "001",
    "002",
    "003",
    "004",
    "005",
    "006",
    "007",
    "008",
    "009",
    "010",
    "011",
    "012",
    "013",
    "019",
  ],
  CA: ["754", "755"],
  GB: ["500", "501", "502", "503", "504", "505", "506", "507", "508", "509"],
  DE: [
    "400",
    "401",
    "402",
    "403",
    "404",
    "405",
    "406",
    "407",
    "408",
    "409",
    "410",
    "411",
    "412",
    "413",
    "414",
    "415",
    "416",
    "417",
    "418",
    "419",
    "440",
  ],
  FR: [
    "300",
    "301",
    "302",
    "303",
    "304",
    "305",
    "306",
    "307",
    "308",
    "309",
    "310",
    "311",
    "312",
    "313",
    "314",
    "315",
    "316",
    "317",
    "318",
    "319",
    "320",
    "321",
    "322",
    "323",
    "324",
    "325",
    "326",
    "327",
    "328",
    "329",
    "330",
    "331",
    "332",
    "333",
    "334",
    "335",
    "336",
    "337",
    "338",
    "339",
    "340",
    "341",
    "342",
    "343",
    "344",
    "345",
    "346",
    "347",
    "348",
    "349",
    "350",
    "351",
    "352",
    "353",
    "354",
    "355",
    "356",
    "357",
    "358",
    "359",
    "360",
    "361",
    "362",
    "363",
    "364",
    "365",
    "366",
    "367",
    "368",
    "369",
    "379",
  ],
  AU: ["930", "931", "932", "933", "934", "935", "936", "937", "938", "939"],
  JP: [
    "450",
    "451",
    "452",
    "453",
    "454",
    "455",
    "456",
    "457",
    "458",
    "459",
    "490",
    "491",
    "492",
    "493",
    "494",
    "495",
    "496",
    "497",
    "498",
    "499",
  ],
};

export class ISRCGenerator {
  private registrantCodeRegistry: Map<string, string> = new Map();
  private static readonly MAX_REGISTRY = 200_000;

  constructor() {
    this?.registrantCodeRegistry.set("default", "MXB");
  }

  generate(
    countryCode: string,
    registrantCode: string,
    year: number,
    designation: number,
  ): CodeGenerationResult {
    const _errors = this?.validateInputs(
      countryCode,
      registrantCode,
      year,
      designation,
    );
    if (errors?.length > 0) {
      throw new Error(`Invalid ISRC inputs: ${errors?.join(", ")}`);
    }

    const _yearStr = String(year).slice(-2);
    const _designationStr = String(designation).padStart(5, "0");

    const _code = `${countryCode}${registrantCode}${yearStr}${designationStr}`;
    const _formatted = `${countryCode}-${registrantCode}-${yearStr}-${designationStr}`;

    return { code, formatted };
  }

  private validateInputs(
    countryCode: string,
    registrantCode: string,
    year: number,
    designation: number,
  ): string[] {
    const errors: string[] = [];

    if (!countryCode || countryCode?.length !== 2) {
      errors?.push("Country code must be 2 characters");
    } else if (!VALID_COUNTRY_CODES?.includes(countryCode?.toUpperCase())) {
      errors?.push(`Invalid country code: ${countryCode}`);
    }

    if (!registrantCode || registrantCode?.length !== 3) {
      errors?.push("Registrant code must be 3 alphanumeric characters");
    } else if (!/^[A-Z0-9]{3}$/.test(registrantCode?.toUpperCase())) {
      errors?.push("Registrant code must be alphanumeric");
    }

    const _currentYear = new Date().getFullYear();
    if (year < 1970 || year > currentYear + 1) {
      errors?.push(`Year must be between 1970 and ${currentYear + 1}`);
    }

    if (designation < 1 || designation > 99999) {
      errors?.push("Designation must be between 1 and 99999");
    }

    return errors;
  }

  validate(isrc: string): ISRCValidationResult {
    const errors: string[] = [];

    if (!isrc) {
      return { valid: false, errors: ["ISRC is required"] };
    }

    const _cleanISRC = isrc?.replace(/-/g, "").toUpperCase();

    if (cleanISRC?.length !== 12) {
      errors?.push(
        `ISRC must be exactly 12 characters (got ${cleanISRC?.length})`,
      );
      return { valid: false, errors };
    }

    const _countryCode = cleanISRC?.substring(0, 2);
    if (!VALID_COUNTRY_CODES?.includes(countryCode)) {
      errors?.push(`Invalid country code: ${countryCode}`);
    }

    const _registrantCode = cleanISRC?.substring(2, 5);
    if (!/^[A-Z0-9]{3}$/.test(registrantCode)) {
      errors?.push(
        `Invalid registrant code: ${registrantCode}. Must be 3 alphanumeric characters`,
      );
    }

    const _yearCode = cleanISRC?.substring(5, 7);
    if (!/^\d{2}$/.test(yearCode)) {
      errors?.push(`Invalid year code: ${yearCode}. Must be 2 digits`);
    }

    const _designation = cleanISRC?.substring(7, 12);
    if (!/^\d{5}$/.test(designation)) {
      errors?.push(`Invalid designation: ${designation}. Must be 5 digits`);
    }

    return { valid: errors?.length === 0, errors };
  }

  parse(isrc: string): ISRCParsedResult {
    const _validationResult = this?.validate(isrc);
    if (!validationResult?.valid) {
      throw new Error(`Invalid ISRC: ${validationResult?.errors.join(", ")}`);
    }

    const _cleanISRC = isrc?.replace(/-/g, "").toUpperCase();

    return {
      country: cleanISRC?.substring(0, 2),
      registrant: cleanISRC?.substring(2, 5),
      year: cleanISRC?.substring(5, 7),
      designation: cleanISRC?.substring(7, 12),
    };
  }

  format(isrc: string): string {
    const _cleanISRC = isrc?.replace(/-/g, "").toUpperCase();
    if (cleanISRC?.length !== 12) {
      throw new Error("Invalid ISRC length");
    }

    return `${cleanISRC?.substring(0, 2)}-${cleanISRC?.substring(2, 5)}-${cleanISRC?.substring(5, 7)}-${cleanISRC?.substring(7, 12)}`;
  }

  getCountryName(countryCode: string): string {
    const countryNames: { [code: string]: string } = {
      US: "United States",
      GB: "United Kingdom",
      DE: "Germany",
      FR: "France",
      ES: "Spain",
      IT: "Italy",
      NL: "Netherlands",
      BE: "Belgium",
      AT: "Austria",
      CH: "Switzerland",
      SE: "Sweden",
      NO: "Norway",
      DK: "Denmark",
      FI: "Finland",
      AU: "Australia",
      NZ: "New Zealand",
      CA: "Canada",
      JP: "Japan",
      KR: "South Korea",
      CN: "China",
      BR: "Brazil",
      MX: "Mexico",
      AR: "Argentina",
      QM: "International",
      QZ: "International",
      ZZ: "Unknown",
    };
    return countryNames[countryCode] || "Unknown";
  }

  registerRegistrantCode(userId: string, code: string): void {
    if (!/^[A-Z0-9]{3}$/.test(code?.toUpperCase())) {
      throw new Error("Registrant code must be 3 alphanumeric characters");
    }
    if (this?.registrantCodeRegistry.size >= ISRCGenerator?.MAX_REGISTRY) {
      const _evictKey = this?.registrantCodeRegistry.keys().next().value;
      if (evictKey && evictKey !== "default")
        this?.registrantCodeRegistry.delete(evictKey);
    }
    this?.registrantCodeRegistry.set(userId, code?.toUpperCase());
    logger?.info(`Registered ISRC registrant code ${code} for user ${userId}`);
  }

  getRegistrantCode(userId: string): string {
    return (
      this?.registrantCodeRegistry.get(userId) ||
      this?.registrantCodeRegistry.get("default") ||
      "MXB"
    );
  }
}

export class UPCGenerator {
  private companyPrefixRegistry: Map<string, string> = new Map();
  private static readonly MAX_REGISTRY = 200_000;

  constructor() {
    this?.companyPrefixRegistry.set("default", "850037");
  }

  generate(companyPrefix: string, itemReference: string): CodeGenerationResult {
    const _errors = this?.validateInputs(companyPrefix, itemReference);
    if (errors?.length > 0) {
      throw new Error(`Invalid UPC inputs: ${errors?.join(", ")}`);
    }

    const _baseCode = companyPrefix + itemReference;

    if (baseCode?.length !== 11) {
      throw new Error(
        `Base code must be 11 digits for UPC-A (got ${baseCode?.length})`,
      );
    }

    const _checkDigit = this?.calculateCheckDigit(baseCode);
    const _code = baseCode + checkDigit;

    return {
      code,
      formatted: code,
      checkDigit,
    };
  }

  private validateInputs(
    companyPrefix: string,
    itemReference: string,
  ): string[] {
    const errors: string[] = [];

    if (!companyPrefix || !/^\d+$/.test(companyPrefix)) {
      errors?.push("Company prefix must be numeric");
    } else if (companyPrefix?.length < 6 || companyPrefix?.length > 10) {
      errors?.push("Company prefix must be 6-10 digits");
    }

    if (!itemReference || !/^\d+$/.test(itemReference)) {
      errors?.push("Item reference must be numeric");
    }

    const _totalLength =
      (companyPrefix?.length || 0) + (itemReference?.length || 0);
    if (totalLength !== 11) {
      errors?.push(
        `Combined prefix and item reference must be 11 digits (got ${totalLength})`,
      );
    }

    return errors;
  }

  calculateCheckDigit(code: string): string {
    const _cleanCode = code?.replace(/\D/g, "");

    if (cleanCode?.length !== 11 && cleanCode?.length !== 12) {
      throw new Error(
        `Code must be 11 or 12 digits for check digit calculation (got ${cleanCode?.length})`,
      );
    }

    const _digits = cleanCode?.slice(0, 11).split("").map(Number);

    let sum = 0;
    for (let i = 0; i < 11; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }

    const _checkDigit = (10 - (sum % 10)) % 10;
    return String(checkDigit);
  }

  validate(upc: string): UPCValidationResult {
    const errors: string[] = [];

    if (!upc) {
      return { valid: false, errors: ["UPC is required"] };
    }

    const _cleanUPC = upc?.replace(/\D/g, "");

    if (cleanUPC?.length === 12) {
      const _baseCode = cleanUPC?.slice(0, 11);
      const _providedCheckDigit = cleanUPC?.charAt(11);
      const _calculatedCheckDigit = this?.calculateCheckDigit(baseCode);

      if (providedCheckDigit !== calculatedCheckDigit) {
        errors?.push(
          `Invalid check digit. Expected ${calculatedCheckDigit}, got ${providedCheckDigit}`,
        );
      }
    } else if (cleanUPC?.length === 13) {
      const _baseCode = cleanUPC?.slice(0, 12);
      const _providedCheckDigit = cleanUPC?.charAt(12);
      const _calculatedCheckDigit = this?.calculateEAN13CheckDigit(baseCode);

      if (providedCheckDigit !== calculatedCheckDigit) {
        errors?.push(
          `Invalid EAN-13 check digit. Expected ${calculatedCheckDigit}, got ${providedCheckDigit}`,
        );
      }
    } else {
      errors?.push(
        `UPC must be 12 digits (UPC-A) or 13 digits (EAN-13). Got ${cleanUPC?.length}`,
      );
    }

    if (!/^\d+$/.test(cleanUPC)) {
      errors?.push("UPC must contain only digits");
    }

    return { valid: errors?.length === 0, errors };
  }

  calculateEAN13CheckDigit(code: string): string {
    const _cleanCode = code?.replace(/\D/g, "");

    if (cleanCode?.length !== 12 && cleanCode?.length !== 13) {
      throw new Error(
        `Code must be 12 or 13 digits for EAN-13 check digit calculation (got ${cleanCode?.length})`,
      );
    }

    const _digits = cleanCode?.slice(0, 12).split("").map(Number);

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }

    const _checkDigit = (10 - (sum % 10)) % 10;
    return String(checkDigit);
  }

  convertUPCToEAN13(upc: string): string {
    const _cleanUPC = upc?.replace(/\D/g, "");

    if (cleanUPC?.length !== 12) {
      throw new Error("UPC-A must be 12 digits to convert to EAN-13");
    }

    const _baseCode = "0" + cleanUPC?.slice(0, 11);
    const _checkDigit = this?.calculateEAN13CheckDigit(baseCode);

    return baseCode + checkDigit;
  }

  convertEAN13ToUPC(ean13: string): string {
    const _cleanEAN = ean13?.replace(/\D/g, "");

    if (cleanEAN?.length !== 13) {
      throw new Error("EAN-13 must be 13 digits");
    }

    if (cleanEAN?.charAt(0) !== "0") {
      throw new Error(
        "Only EAN-13 codes starting with 0 can be converted to UPC-A",
      );
    }

    return cleanEAN?.slice(1);
  }

  getCountryFromGS1Prefix(upc: string): string {
    const _cleanCode = upc?.replace(/\D/g, "");
    const _prefix = cleanCode?.substring(0, 3);

    for (const [country, prefixes] of Object?.entries(GS1_PREFIXES)) {
      if (prefixes?.includes(prefix)) {
        return country;
      }
    }

    return "Unknown";
  }

  registerCompanyPrefix(userId: string, prefix: string): void {
    if (!/^\d{6,10}$/.test(prefix)) {
      throw new Error("Company prefix must be 6-10 digits");
    }
    if (this?.companyPrefixRegistry.size >= UPCGenerator?.MAX_REGISTRY) {
      const _evictKey = this?.companyPrefixRegistry.keys().next().value;
      if (evictKey && evictKey !== "default")
        this?.companyPrefixRegistry.delete(evictKey);
    }
    this?.companyPrefixRegistry.set(userId, prefix);
    logger?.info(`Registered UPC company prefix ${prefix} for user ${userId}`);
  }

  getCompanyPrefix(userId: string): string {
    return (
      this?.companyPrefixRegistry.get(userId) ||
      this?.companyPrefixRegistry.get("default") ||
      "850037"
    );
  }

  generateNextItemReference(
    companyPrefix: string,
    lastUsed: number = 0,
  ): string {
    const _prefixLength = companyPrefix?.length;
    const _itemRefLength = 11 - prefixLength;
    const _nextNumber = lastUsed + 1;

    const _maxValue = Math?.pow(10, itemRefLength) - 1;
    if (nextNumber > maxValue) {
      throw new Error(
        `Item reference overflow. Maximum value for ${itemRefLength} digits is ${maxValue}`,
      );
    }

    return String(nextNumber).padStart(itemRefLength, "0");
  }
}

export class MusicCodesService {
  private isrcGenerator: ISRCGenerator;
  private upcGenerator: UPCGenerator;

  constructor() {
    this.isrcGenerator = new ISRCGenerator();
    this.upcGenerator = new UPCGenerator();
  }

  async generateISRC(
    userId: string,
    countryCode: string = "US",
  ): Promise<CodeGenerationResult> {
    const _registrantCode = this?.isrcGenerator.getRegistrantCode(userId);
    const _year = new Date().getFullYear();
    const _redisKey = `music:isrc:ctr:${userId}:${year}`;
    let designation: number;
    try {
      const _pdim = getPdimClient();
      designation = (await pdim?.incr(redisKey)) as number;
      // Expire counter after 2 years so old year keys are cleaned up automatically
      await pdim?.expire(redisKey, 2 * 365 * 24 * 3600);
    } catch {
      // Fallback: use a timestamp-based unique designation if Redis is unavailable
      designation = Math?.floor(Date?.now() % 99999) + 1;
    }
    const _result = this?.isrcGenerator.generate(
      countryCode,
      registrantCode,
      year,
      designation,
    );
    logger?.info(`Generated ISRC ${result?.formatted} for user ${userId}`);
    return result;
  }

  async generateUPC(userId: string): Promise<CodeGenerationResult> {
    const _companyPrefix = this?.upcGenerator.getCompanyPrefix(userId);
    const _redisKey = `music:upc:ctr:${userId}:${companyPrefix}`;
    let lastUsed: number;
    try {
      const _pdim = getPdimClient();
      lastUsed = ((await pdim?.incr(redisKey)) as number) - 1;
    } catch {
      lastUsed = Math?.floor(Date?.now() % 9999);
    }
    const _itemReference = this?.upcGenerator.generateNextItemReference(
      companyPrefix,
      lastUsed,
    );
    const _result = this?.upcGenerator.generate(companyPrefix, itemReference);
    logger?.info(`Generated UPC ${result?.code} for user ${userId}`);
    return result;
  }

  validateISRC(isrc: string): ISRCValidationResult {
    return this?.isrcGenerator.validate(isrc);
  }

  validateUPC(upc: string): UPCValidationResult {
    return this?.upcGenerator.validate(upc);
  }

  parseISRC(isrc: string): ISRCParsedResult {
    return this?.isrcGenerator.parse(isrc);
  }

  formatISRC(isrc: string): string {
    return this?.isrcGenerator.format(isrc);
  }

  registerISRCCode(userId: string, registrantCode: string): void {
    this?.isrcGenerator.registerRegistrantCode(userId, registrantCode);
  }

  registerUPCPrefix(userId: string, companyPrefix: string): void {
    this?.upcGenerator.registerCompanyPrefix(userId, companyPrefix);
  }

  async generateBulkISRCs(
    userId: string,
    count: number,
    countryCode: string = "US",
  ): Promise<CodeGenerationResult[]> {
    const results: CodeGenerationResult[] = [];
    for (let i = 0; i < count; i++) {
      results?.push(await this?.generateISRC(userId, countryCode));
    }
    return results;
  }

  validateBulkCodes(codes: { type: "isrc" | "upc"; code: string }[]): {
    code: string;
    type: string;
    valid: boolean;
    errors: string[];
  }[] {
    return codes?.map(({ type, code }) => {
      const _result =
        type === "isrc" ? this?.validateISRC(code) : this?.validateUPC(code);
      return { code, type, valid: result?.valid, errors: result?.errors };
    });
  }

  getValidCountryCodes(): string[] {
    return [...VALID_COUNTRY_CODES];
  }
}

export const _musicCodesService = new MusicCodesService();
export const _isrcGenerator = new ISRCGenerator();
export const _upcGenerator = new UPCGenerator();
