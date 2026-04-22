export interface EppConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  tlsCert?: string;
  tlsKey?: string;
}

export interface EppResponse {
  code: number;
  msg: string;
  trid: {
    clTRID?: string;
    svTRID: string;
  };
  data?: any;
  resData?: any;
  extension?: any;
}

export interface EppSessionState {
  connected: boolean;
  loggedIn: boolean;
  greeting?: any;
}
