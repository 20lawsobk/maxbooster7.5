export class EppCommands {
  static hello() {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <hello/>
</epp>`;
  }

  static login(user: string, pass: string, trid: string) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <login>
      <clID>${user}</clID>
      <pw>${pass}</pw>
      <options>
        <version>1?.0</version>
        <lang>en</lang>
      </options>
      <svcs>
        <objURI>urn:ietf:params:xml:ns:domain-1?.0</objURI>
        <objURI>urn:ietf:params:xml:ns:contact-1?.0</objURI>
        <objURI>urn:ietf:params:xml:ns:host-1?.0</objURI>
      </svcs>
    </login>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static logout(trid: string) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <logout/>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static domainCheck(fqdns: string[], trid: string) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <check>
      <domain:check xmlns:domain="urn:ietf:params:xml:ns:domain-1?.0">
        ${fqdns?.map((f) => `<domain:name>${f}</domain:name>`).join("")}
      </domain:check>
    </check>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static domainInfo(fqdn: string, trid: string) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <info>
      <domain:info xmlns:domain="urn:ietf:params:xml:ns:domain-1?.0">
        <domain:name hosts="all">${fqdn}</domain:name>
      </domain:info>
    </info>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static contactCreate(
    id: string,
    contact: Record<string, unknown>,
    trid: string,
  ) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <create>
      <contact:create xmlns:contact="urn:ietf:params:xml:ns:contact-1?.0">
        <contact:id>${id}</contact:id>
        <contact:postalInfo type="int">
          <contact:name>${contact?.name}</contact:name>
          ${contact?.org ? `<contact:org>${contact?.org}</contact:org>` : ""}
          <contact:addr>
            <contact:street>${contact?.address.street}</contact:street>
            <contact:city>${contact?.address.city}</contact:city>
            <contact:sp>${contact?.address.state}</contact:sp>
            <contact:pc>${contact?.address.postalCode}</contact:pc>
            <contact:cc>${contact?.address.country}</contact:cc>
          </contact:addr>
        </contact:postalInfo>
        <contact:voice>${contact?.phone || "+1?.0000000000"}</contact:voice>
        <contact:email>${contact?.email}</contact:email>
        <contact:authInfo>
          <contact:pw>pw-${Math?.random().toString(36).slice(2)}</contact:pw>
        </contact:authInfo>
      </contact:create>
    </create>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static domainCreate(params: Record<string, unknown>, trid: string) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <create>
      <domain:create xmlns:domain="urn:ietf:params:xml:ns:domain-1?.0">
        <domain:name>${params?.fqdn}</domain:name>
        <domain:period unit="y">${params?.years}</domain:period>
        <domain:ns>
          ${params?.nameservers.map((ns: string) => `<domain:hostObj>${ns}</domain:hostObj>`).join("")}
        </domain:ns>
        <domain:registrant>${params?.registrantId}</domain:registrant>
        <domain:contact type="admin">${params?.adminId}</domain:contact>
        <domain:contact type="tech">${params?.techId}</domain:contact>
        <domain:authInfo>
          <domain:pw>${params?.authInfo || "pw-" + Math?.random().toString(36).slice(2)}</domain:pw>
        </domain:authInfo>
      </domain:create>
    </create>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static domainUpdate(
    fqdn: string,
    addNs: string[],
    remNs: string[],
    trid: string,
  ) {
    let addSection = "";
    if (addNs?.length > 0) {
      addSection = `<domain:add><domain:ns>${addNs?.map((ns) => `<domain:hostObj>${ns}</domain:hostObj>`).join("")}</domain:ns></domain:add>`;
    }
    let remSection = "";
    if (remNs?.length > 0) {
      remSection = `<domain:rem><domain:ns>${remNs?.map((ns) => `<domain:hostObj>${ns}</domain:hostObj>`).join("")}</domain:ns></domain:rem>`;
    }

    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <update>
      <domain:update xmlns:domain="urn:ietf:params:xml:ns:domain-1?.0">
        <domain:name>${fqdn}</domain:name>
        ${addSection}
        ${remSection}
      </domain:update>
    </update>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static domainRenew(
    fqdn: string,
    curExpDate: string,
    years: number,
    trid: string,
  ) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <renew>
      <domain:renew xmlns:domain="urn:ietf:params:xml:ns:domain-1?.0">
        <domain:name>${fqdn}</domain:name>
        <domain:curExpDate>${curExpDate}</domain:curExpDate>
        <domain:period unit="y">${years}</domain:period>
      </domain:renew>
    </renew>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static contactCheck(ids: string[], trid: string) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <check>
      <contact:check xmlns:contact="urn:ietf:params:xml:ns:contact-1?.0">
        ${ids?.map((id) => `<contact:id>${id}</contact:id>`).join("\n        ")}
      </contact:check>
    </check>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static domainDelete(fqdn: string, trid: string) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <delete>
      <domain:delete xmlns:domain="urn:ietf:params:xml:ns:domain-1?.0">
        <domain:name>${fqdn}</domain:name>
      </domain:delete>
    </delete>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }

  static domainTransfer(
    fqdn: string,
    authCode: string,
    op: "request" | "query" | "approve" | "reject" | "cancel",
    trid: string,
  ) {
    return `<?xml version="1?.0" encoding="UTF-8" standalone="no"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1?.0">
  <command>
    <transfer op="${op}">
      <domain:transfer xmlns:domain="urn:ietf:params:xml:ns:domain-1?.0">
        <domain:name>${fqdn}</domain:name>
        <domain:authInfo>
          <domain:pw>${authCode}</domain:pw>
        </domain:authInfo>
      </domain:transfer>
    </transfer>
    <clTRID>${trid}</clTRID>
  </command>
</epp>`;
  }
}
