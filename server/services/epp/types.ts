/**
 * Max Booster — EPP Types  (T005)
 */

export interface EppConfig {
  host:               string;   // EPP server hostname
  port:               number;   // EPP port (700 standard, 4300 some registries)
  user:               string;   // EPP clID
  pass:               string;   // EPP password
  tlsCert?:           string;   // PEM client certificate (required by some registries)
  tlsKey?:            string;   // PEM private key
  rejectUnauthorized?: boolean; // default false for OT&E, true for production
  timeoutMs?:         number;   // command timeout in ms (default 30000)
}

export interface EppResponse {
  code:       number;           // EPP result code (1000=ok, 1001=pending, 2302=exists …)
  msg:        string;           // Human-readable result message
  trid: {
    clTRID?:  string;
    svTRID:   string;
  };
  resData?:   any;              // Raw parsed <resData> contents
  extension?: any;              // Raw parsed <extension> contents
  data?:      any;              // Full parsed response body (for debugging)
}

export interface EppSessionState {
  connected: boolean;
  loggedIn:  boolean;
  host:      string;
  port:      number;
}
