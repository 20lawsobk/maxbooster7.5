# ARIN ASN and IP Block Application Guide

Obtaining your own Autonomous System Number (ASN) and IPv4 address block is required for true BGP Anycast.

## Requirements
1. **Legal Entity**: You must be a registered business or organization.
2. **Multi-homing Plan**: You must plan to connect to at least two different ISPs.
3. **Justification**: Prove you need a /24 (256 IPs) or larger block.

## Step-by-Step Process

### 1. Create an ARIN Online Account
Go to [ARIN Online](https://account.arin.net/) and create a user profile.

### 2. Create an Organization Identifier (Org ID)
- Log in and go to "Organization Services" -> "Create Org ID".
- Provide business registration documents.
- Fee: ~$50 USD.

### 3. Apply for an ASN
- Go to "Request Resources" -> "Autonomous System Number (ASN)".
- **Justification**: Provide the names and contact info of your two upstream ISPs.
- **Verification Letter**: A simple letter stating your intent to multihome.
- Fee: ~$550 USD (one-time).

### 4. Apply for IPv4 Addresses
- Go to "Request Resources" -> "IPv4 Addresses".
- Minimum allocation for Anycast is typically a /24.
- Provide technical justification for Anycast (geographic distribution, DDoS mitigation).
- Fee: ~$250 USD per year (for /24).

## BGP Peering
Once you have your ASN and IPs:
1. **LOA (Letter of Authorization)**: Send an LOA to your VPS/Data Center providers so they can announce your IPs.
2. **ROA (Route Origin Authorization)**: Create an ROA in the ARIN dashboard to prove your ASN is authorized to announce the prefix (RPKI).
3. **Peering Session**: Request a BGP session from your provider. They will provide `UPSTREAM_IP` and `UPSTREAM_ASN`.
