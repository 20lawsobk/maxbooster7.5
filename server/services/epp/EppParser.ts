import { XMLParser } from 'fast-xml-parser';
import { EppResponse } from './types.js';

export class EppParser {
  private static parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
  });

  static parseResponse(xml: string): EppResponse {
    const jsonObj = this.parser.parse(xml);
    const epp = jsonObj.epp;
    if (!epp || !epp.response) {
        // Might be a greeting
        if (epp && epp.greeting) {
            return {
                code: 1000,
                msg: "Greeting",
                trid: { svTRID: epp.greeting.svID },
                data: epp.greeting
            };
        }
        throw new Error("Invalid EPP response");
    }

    const response = epp.response;
    const result = response.result;
    
    return {
      code: parseInt(result["@_code"]),
      msg: result.msg,
      trid: {
        clTRID: response.trID.clTRID,
        svTRID: response.trID.svTRID,
      },
      resData: response.resData,
      extension: response.extension
    };
  }
}
