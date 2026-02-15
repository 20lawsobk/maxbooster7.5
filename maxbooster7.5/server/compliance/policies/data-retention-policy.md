# Data Retention Policy

**Document Version:** 1.0  
**Effective Date:** November 11, 2025  
**Last Reviewed:** November 11, 2025  
**Policy Owner:** Chief Information Security Officer  
**Compliance Standards:** GDPR, SOC2, ISO 27001

## 1. Purpose

This Data Retention Policy defines how long Max Booster retains different types of data and establishes procedures for secure data disposal. This policy ensures compliance with GDPR, SOC2, and other regulatory requirements while supporting business operations.

## 2. Scope

This policy applies to all data collected, processed, and stored by Max Booster, including:
- User and customer personal data
- Business records and transactions
- Financial data
- System logs and audit trails
- Employee records
- Marketing and analytics data

## 3. Data Retention Principles

### 3.1 Legal Compliance
- Data retained only as long as necessary for stated purposes
- Retention periods comply with GDPR, CCPA, and applicable laws
- Legal hold procedures override standard retention for litigation

### 3.2 Business Need
- Retention based on business, legal, and regulatory requirements
- Regular review of retention schedules
- Automated deletion where feasible

### 3.3 Security and Privacy
- Retained data protected with appropriate security controls
- Access limited to authorized personnel
- Secure disposal when retention period expires

## 4. Data Retention Schedules

### 4.1 User and Customer Data

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| User account information | Duration of account + 2 years | Contract performance, legal obligation |
| Payment information | Duration of account + 7 years | Legal obligation (tax, financial regulations) |
| User-generated content (music, projects) | Duration of account + 1 year | Contract performance, user consent |
| Communication preferences | Until consent withdrawn | User consent (GDPR Article 6.1.a) |
| Marketing data | 3 years from last interaction or until consent withdrawn | User consent |
| Support tickets | 5 years | Legitimate business interest, contract performance |
| Analytics data (anonymized) | 3 years | Legitimate business interest |
| Session logs | 90 days | Security, legitimate business interest |

### 4.2 Financial and Business Records

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| Financial statements | 7 years | Legal obligation (tax, audit) |
| Invoices and receipts | 7 years | Legal obligation (tax) |
| Royalty payment records | 10 years | Contract performance, legal obligation |
| Revenue sharing calculations | 10 years | Contract performance, legal obligation |
| Tax records | 7 years | Legal obligation |
| Contracts and agreements | 7 years after expiration | Legal obligation, contract performance |
| Bank statements | 7 years | Legal obligation |

### 4.3 Security and Audit Logs

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| Security event logs | 1 year | Security, SOC2 compliance |
| Access logs | 1 year | Security, GDPR accountability |
| Audit trails | 7 years | SOC2, ISO 27001, legal obligation |
| Incident response records | 7 years | Legal obligation, security |
| Penetration test results | 3 years | Security, compliance |
| Vulnerability assessments | 3 years | Security, compliance |

### 4.4 Employee Data

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| Employment contracts | 7 years after termination | Legal obligation |
| Payroll records | 7 years | Legal obligation (tax, employment law) |
| Performance reviews | 3 years after termination | Legitimate business interest |
| Training records | 3 years after termination | Compliance, legitimate business interest |
| Background checks | 7 years | Legal obligation, legitimate business interest |
| Termination records | 7 years | Legal obligation, defense of legal claims |

### 4.5 System and Application Data

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| Application logs | 90 days | Security, troubleshooting |
| Database backups | 90 days (daily), 1 year (monthly) | Business continuity |
| Error logs | 90 days | Troubleshooting, quality assurance |
| Performance metrics | 2 years | Business analytics |
| API request logs | 90 days | Security, troubleshooting |

## 5. Data Disposal Procedures

### 5.1 Automated Deletion
- Automated processes identify data past retention period
- Scheduled deletion jobs run weekly
- Deletion logs maintained for audit purposes
- Verification of deletion completion

### 5.2 Secure Deletion Methods
- **Electronic Data:**
  - Secure deletion using industry-standard methods
  - Database records: DELETE with VACUUM for PostgreSQL
  - Files: Secure overwrite (3-pass minimum)
  - Backups: Encrypted backup deletion with verification
  
- **Physical Media:**
  - Hard drives: DoD 5220.22-M compliant wiping or physical destruction
  - Certificates of destruction obtained from vendors
  - Media tracking log maintained

### 5.3 Exceptions to Deletion
Data may be retained beyond standard periods for:
- Active legal proceedings (legal hold)
- Regulatory investigations
- Ongoing disputes or claims
- Explicit user requests to retain data

## 6. GDPR Data Subject Rights

### 6.1 Right to Erasure ("Right to be Forgotten")
- Users may request deletion of personal data
- Requests fulfilled within 30 days
- Exceptions apply for legal obligations or legitimate interests
- Confirmation provided to user upon deletion

### 6.2 Data Portability
- Users may request data in portable format (JSON, CSV)
- Provided within 30 days of request
- Includes all personal data processed by Max Booster

### 6.3 Access Requests
- Users may request copy of their personal data
- Provided within 30 days of request
- Free of charge for first request

## 7. Data Retention Register

Max Booster maintains a Data Retention Register that documents:
- Data categories and types
- Retention periods and legal basis
- Disposal methods and schedules
- Responsible personnel
- Last review date

The register is reviewed quarterly and updated as needed.

## 8. Backup and Archival

### 8.1 Backup Retention
- **Daily backups:** 30 days
- **Weekly backups:** 90 days
- **Monthly backups:** 1 year
- **Annual backups:** 7 years (for compliance data only)

### 8.2 Archival Procedures
- Long-term archival for records requiring extended retention
- Archives encrypted and access-controlled
- Archival media tested annually for integrity
- Disposal after retention period expires

## 9. Roles and Responsibilities

### 9.1 Data Protection Officer (DPO)
- Oversee data retention compliance
- Review and approve retention schedules
- Handle data subject requests
- Conduct periodic audits

### 9.2 IT and Security Teams
- Implement automated retention and deletion
- Maintain backup and archival systems
- Ensure secure disposal procedures
- Monitor deletion logs

### 9.3 Legal and Compliance
- Define retention requirements based on regulations
- Handle legal holds and litigation support
- Review retention policy annually

### 9.4 Data Owners
- Classify data according to retention schedules
- Approve exceptions to standard retention
- Ensure data quality and accuracy

## 10. Policy Exceptions

Exceptions to retention periods require:
- Written justification
- Legal or compliance team approval
- Documentation in retention register
- Regular review of ongoing exceptions

## 11. Training and Awareness

All employees receive training on:
- Data retention principles and schedules
- Secure disposal procedures
- GDPR data subject rights
- Consequences of non-compliance

## 12. Monitoring and Auditing

### 12.1 Compliance Monitoring
- Quarterly reviews of retention compliance
- Automated alerts for data nearing retention expiration
- Audit trail of all deletions

### 12.2 Audits
- Annual internal audit of retention practices
- External audits as part of SOC2 and ISO 27001 certification
- Findings documented and remediated

## 13. Policy Review

This policy is reviewed annually or when:
- Regulations change (GDPR updates, new laws)
- Business practices change
- Data types or systems change
- Audit findings require updates

## 14. Approval

**Approved by:**  
[CISO Signature]  
Date: November 11, 2025

**Reviewed by:**  
[Legal Counsel]  
[Data Protection Officer]  
Date: November 11, 2025
