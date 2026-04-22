import { EppClient } from './EppClient.js';
import { EppCommands } from './EppCommands.ts';
import { EppParser } from './EppParser.ts';
import { EppConfig, EppResponse } from './types.ts';
import { logger } from '../../logger.js';

export class EppSession {
  private client: EppClient;
  private config: EppConfig;
  private loggedIn: boolean = false;

  constructor(config: EppConfig) {
    this.config = config;
    this.client = new EppClient(config);
  }

  private generateTrid(): string {
    return `MB-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  }

  async connectAndLogin(): Promise<void> {
    const greetingXml = await this.client.connectAndGetGreeting();
    const greeting = EppParser.parseResponse(greetingXml);
    logger.info('EPP connected, received greeting from', greeting.trid.svTRID);

    const trid = this.generateTrid();
    const loginXml = EppCommands.login(this.config.user, this.config.pass, trid);
    const responseXml = await this.client.send(loginXml);
    const response = EppParser.parseResponse(responseXml);

    if (response.code !== 1000) {
      throw new Error(`EPP login failed: ${response.msg} (code ${response.code})`);
    }

    this.loggedIn = true;
    logger.info('EPP login successful');
  }

  async executeCommand(commandXml: string): Promise<EppResponse> {
    if (!this.loggedIn) {
      await this.connectAndLogin();
    }

    try {
      const responseXml = await this.client.send(commandXml);
      return EppParser.parseResponse(responseXml);
    } catch (error) {
      logger.error('EPP command execution failed:', error);
      this.loggedIn = false; // Assume session might be dead
      throw error;
    }
  }

  async checkAvailability(fqdn: string): Promise<boolean> {
    const trid = this.generateTrid();
    const xml = EppCommands.domainCheck([fqdn], trid);
    const resp = await this.executeCommand(xml);
    
    if (resp.code !== 1000) return false;
    
    const chkData = resp.resData?.chkData;
    if (!chkData) return false;

    // Fast-xml-parser might return single item or array
    const names = Array.isArray(chkData.cd) ? chkData.cd : [chkData.cd];
    const match = names.find((n: any) => n.name['#text'] === fqdn || n.name === fqdn);
    if (!match) return false;

    return match.name['@_avail'] === '1' || match.name['@_avail'] === 'true';
  }

  async getDomainInfo(fqdn: string): Promise<any> {
    const trid = this.generateTrid();
    const xml = EppCommands.domainInfo(fqdn, trid);
    return await this.executeCommand(xml);
  }

  async registerDomain(params: any): Promise<EppResponse> {
      const trid = this.generateTrid();
      const xml = EppCommands.domainCreate(params, trid);
      return await this.executeCommand(xml);
  }

  async createContact(id: string, contact: any): Promise<EppResponse> {
      const trid = this.generateTrid();
      const xml = EppCommands.contactCreate(id, contact, trid);
      return await this.executeCommand(xml);
  }

  async renewDomain(fqdn: string, curExpDate: string, years: number): Promise<EppResponse> {
      const trid = this.generateTrid();
      const xml = EppCommands.domainRenew(fqdn, curExpDate, years, trid);
      return await this.executeCommand(xml);
  }

  async updateNameservers(fqdn: string, addNs: string[], remNs: string[]): Promise<EppResponse> {
      const trid = this.generateTrid();
      const xml = EppCommands.domainUpdate(fqdn, addNs, remNs, trid);
      return await this.executeCommand(xml);
  }

  async transferDomain(fqdn: string, authCode: string): Promise<EppResponse> {
      const trid = this.generateTrid();
      const xml = EppCommands.domainTransfer(fqdn, authCode, 'request', trid);
      return await this.executeCommand(xml);
  }

  async logout(): Promise<void> {
    if (this.loggedIn) {
      const trid = this.generateTrid();
      await this.client.send(EppCommands.logout(trid));
      this.loggedIn = false;
    }
    this.client.disconnect();
  }
}
