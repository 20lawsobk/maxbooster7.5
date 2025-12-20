import { nanoid } from 'nanoid';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { logger } from '../logger.js';

export type ContractType = 
  | 'non_exclusive_license'
  | 'exclusive_license'
  | 'free_download'
  | 'nda'
  | 'session_musician'
  | 'mixer_engineer'
  | 'split_sheet'
  | 'sync_license'
  | 'work_for_hire'
  | 'producer_agreement';

export interface ContractVariables {
  artistName?: string;
  producerName?: string;
  beatTitle?: string;
  beatBpm?: number;
  beatKey?: string;
  purchasePrice?: number;
  currency?: string;
  licenseType?: string;
  effectiveDate?: Date;
  expirationDate?: Date;
  territory?: string;
  streamLimit?: number;
  salesLimit?: number;
  royaltyPercentage?: number;
  advanceAmount?: number;
  publishingPercentage?: number;
  masterPercentage?: number;
  splits?: Array<{ name: string; percentage: number; role: string }>;
  syncFee?: number;
  projectTitle?: string;
  projectType?: string;
  sessionRate?: number;
  sessionHours?: number;
  mixingFee?: number;
  masteringFee?: number;
  revisions?: number;
  confidentialPeriodYears?: number;
  customTerms?: string[];
}

export interface ContractTemplate {
  id: string;
  type: ContractType;
  name: string;
  description: string;
  category: string;
  variables: string[];
  isPremium: boolean;
}

export interface GeneratedContract {
  id: string;
  templateId: string;
  type: ContractType;
  title: string;
  content: string;
  variables: ContractVariables;
  createdBy: string;
  parties: Array<{ name: string; role: string; email?: string }>;
  signatures: Array<{
    partyName: string;
    signedAt?: Date;
    signatureHash?: string;
    ipAddress?: string;
  }>;
  status: 'draft' | 'pending_signature' | 'partially_signed' | 'fully_executed' | 'expired' | 'voided';
  createdAt: Date;
  expiresAt?: Date;
  pdfUrl?: string;
}

const contractTemplates: ContractTemplate[] = [
  {
    id: 'tpl_non_exclusive',
    type: 'non_exclusive_license',
    name: 'Non-Exclusive Beat License',
    description: 'Standard non-exclusive license allowing the artist to use the beat while the producer retains ownership',
    category: 'Beat Licenses',
    variables: ['artistName', 'producerName', 'beatTitle', 'purchasePrice', 'streamLimit', 'salesLimit', 'territory'],
    isPremium: false,
  },
  {
    id: 'tpl_exclusive',
    type: 'exclusive_license',
    name: 'Exclusive Beat License',
    description: 'Exclusive rights transfer - beat can no longer be sold to others after purchase',
    category: 'Beat Licenses',
    variables: ['artistName', 'producerName', 'beatTitle', 'purchasePrice', 'royaltyPercentage', 'territory'],
    isPremium: false,
  },
  {
    id: 'tpl_free_download',
    type: 'free_download',
    name: 'Free Download License',
    description: 'Free promotional use license with attribution requirements',
    category: 'Beat Licenses',
    variables: ['artistName', 'producerName', 'beatTitle', 'territory'],
    isPremium: false,
  },
  {
    id: 'tpl_nda',
    type: 'nda',
    name: 'Non-Disclosure Agreement',
    description: 'Mutual NDA for protecting confidential information during collaborations',
    category: 'Legal',
    variables: ['artistName', 'producerName', 'confidentialPeriodYears', 'effectiveDate'],
    isPremium: false,
  },
  {
    id: 'tpl_session_musician',
    type: 'session_musician',
    name: 'Session Musician Agreement',
    description: 'Work-for-hire agreement for session musicians including payment terms and rights assignment',
    category: 'Collaboration',
    variables: ['artistName', 'producerName', 'projectTitle', 'sessionRate', 'sessionHours', 'royaltyPercentage'],
    isPremium: true,
  },
  {
    id: 'tpl_mixer_engineer',
    type: 'mixer_engineer',
    name: 'Mixing/Mastering Engineer Agreement',
    description: 'Service agreement for mixing and mastering engineers with deliverables and payment terms',
    category: 'Collaboration',
    variables: ['artistName', 'producerName', 'projectTitle', 'mixingFee', 'masteringFee', 'revisions'],
    isPremium: true,
  },
  {
    id: 'tpl_split_sheet',
    type: 'split_sheet',
    name: 'Royalty Split Sheet',
    description: 'Official documentation of ownership percentages for publishing and master royalties',
    category: 'Royalties',
    variables: ['beatTitle', 'splits', 'publishingPercentage', 'masterPercentage'],
    isPremium: false,
  },
  {
    id: 'tpl_sync_license',
    type: 'sync_license',
    name: 'Sync Licensing Agreement',
    description: 'License for use in film, TV, commercials, video games, and other visual media',
    category: 'Licensing',
    variables: ['artistName', 'producerName', 'beatTitle', 'syncFee', 'projectTitle', 'projectType', 'territory'],
    isPremium: true,
  },
  {
    id: 'tpl_work_for_hire',
    type: 'work_for_hire',
    name: 'Work For Hire Agreement',
    description: 'Complete rights transfer where the hiring party owns all work product',
    category: 'Legal',
    variables: ['artistName', 'producerName', 'projectTitle', 'purchasePrice', 'effectiveDate'],
    isPremium: true,
  },
  {
    id: 'tpl_producer_agreement',
    type: 'producer_agreement',
    name: 'Producer Agreement',
    description: 'Comprehensive agreement between artist and producer for album/EP production',
    category: 'Production',
    variables: ['artistName', 'producerName', 'projectTitle', 'advanceAmount', 'royaltyPercentage', 'publishingPercentage'],
    isPremium: true,
  },
];

class ContractTemplateService {
  private contracts: Map<string, GeneratedContract> = new Map();

  getTemplates(): ContractTemplate[] {
    return contractTemplates;
  }

  getTemplateById(templateId: string): ContractTemplate | undefined {
    return contractTemplates.find(t => t.id === templateId);
  }

  getTemplatesByCategory(category: string): ContractTemplate[] {
    return contractTemplates.filter(t => t.category === category);
  }

  generateContract(
    templateId: string,
    variables: ContractVariables,
    createdBy: string
  ): GeneratedContract {
    const template = this.getTemplateById(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const content = this.generateContractContent(template.type, variables);
    const parties = this.extractParties(template.type, variables);

    const contract: GeneratedContract = {
      id: `contract_${nanoid(12)}`,
      templateId,
      type: template.type,
      title: `${template.name} - ${variables.beatTitle || variables.projectTitle || 'Untitled'}`,
      content,
      variables,
      createdBy,
      parties,
      signatures: parties.map(p => ({ partyName: p.name })),
      status: 'draft',
      createdAt: new Date(),
      expiresAt: variables.expirationDate,
    };

    this.contracts.set(contract.id, contract);
    logger.info(`Generated contract ${contract.id} from template ${templateId}`);
    return contract;
  }

  private extractParties(type: ContractType, variables: ContractVariables): Array<{ name: string; role: string }> {
    const parties: Array<{ name: string; role: string }> = [];

    if (variables.artistName) {
      parties.push({ name: variables.artistName, role: 'Artist/Licensee' });
    }
    if (variables.producerName) {
      parties.push({ name: variables.producerName, role: 'Producer/Licensor' });
    }

    if (type === 'split_sheet' && variables.splits) {
      for (const split of variables.splits) {
        if (!parties.find(p => p.name === split.name)) {
          parties.push({ name: split.name, role: split.role });
        }
      }
    }

    return parties;
  }

  private generateContractContent(type: ContractType, vars: ContractVariables): string {
    const effectiveDate = vars.effectiveDate ? new Date(vars.effectiveDate).toLocaleDateString() : new Date().toLocaleDateString();
    const currency = vars.currency || 'USD';

    switch (type) {
      case 'non_exclusive_license':
        return this.generateNonExclusiveLicense(vars, effectiveDate, currency);
      case 'exclusive_license':
        return this.generateExclusiveLicense(vars, effectiveDate, currency);
      case 'free_download':
        return this.generateFreeDownloadLicense(vars, effectiveDate);
      case 'nda':
        return this.generateNDA(vars, effectiveDate);
      case 'session_musician':
        return this.generateSessionMusicianAgreement(vars, effectiveDate, currency);
      case 'mixer_engineer':
        return this.generateMixerEngineerAgreement(vars, effectiveDate, currency);
      case 'split_sheet':
        return this.generateSplitSheet(vars, effectiveDate);
      case 'sync_license':
        return this.generateSyncLicense(vars, effectiveDate, currency);
      case 'work_for_hire':
        return this.generateWorkForHire(vars, effectiveDate, currency);
      case 'producer_agreement':
        return this.generateProducerAgreement(vars, effectiveDate, currency);
      default:
        throw new Error(`Unknown contract type: ${type}`);
    }
  }

  private generateNonExclusiveLicense(vars: ContractVariables, effectiveDate: string, currency: string): string {
    return `
NON-EXCLUSIVE BEAT LICENSE AGREEMENT

This Non-Exclusive Beat License Agreement ("Agreement") is entered into as of ${effectiveDate} ("Effective Date") by and between:

LICENSOR: ${vars.producerName || '[PRODUCER NAME]'} ("Producer")
LICENSEE: ${vars.artistName || '[ARTIST NAME]'} ("Artist")

1. BEAT INFORMATION
Title: ${vars.beatTitle || '[BEAT TITLE]'}
BPM: ${vars.beatBpm || 'N/A'}
Key: ${vars.beatKey || 'N/A'}

2. LICENSE GRANT
Producer hereby grants to Artist a non-exclusive license to use the Beat in the creation of one (1) new musical composition ("New Song"). This license is non-transferable and non-sublicensable.

3. USAGE RIGHTS
- Distribution: ${vars.salesLimit ? `Up to ${vars.salesLimit.toLocaleString()} copies` : 'Unlimited digital distribution'}
- Streaming: ${vars.streamLimit ? `Up to ${vars.streamLimit.toLocaleString()} streams` : 'Unlimited streaming'}
- Territory: ${vars.territory || 'Worldwide'}
- Performances: Unlimited non-profit performances
- Music Videos: One (1) music video allowed
- Radio Broadcasting: Allowed

4. RESTRICTIONS
Artist may NOT:
- Claim ownership of the underlying composition or beat
- Resell, transfer, or sublicense the beat
- Register the beat with a PRO as sole owner
- Use for more than one (1) song

5. PAYMENT
License Fee: ${currency} ${vars.purchasePrice?.toLocaleString() || '0.00'}
Payment is due upon execution of this Agreement.

6. CREDIT
Artist agrees to credit Producer as follows in all uses:
"Produced by ${vars.producerName || '[PRODUCER NAME]'}"

7. OWNERSHIP
Producer retains all ownership rights to the Beat. This license grants usage rights only and does not transfer ownership.

8. WARRANTIES
Producer warrants that:
- They have full authority to grant this license
- The Beat is original and does not infringe on third-party rights
- No other exclusive license has been granted for this Beat

9. TERM
This license is perpetual unless terminated due to breach.

10. GOVERNING LAW
This Agreement shall be governed by the laws of the State of [STATE], without regard to conflict of law principles.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.

LICENSOR: _________________________ Date: _____________
${vars.producerName || '[PRODUCER NAME]'}

LICENSEE: _________________________ Date: _____________
${vars.artistName || '[ARTIST NAME]'}
`;
  }

  private generateExclusiveLicense(vars: ContractVariables, effectiveDate: string, currency: string): string {
    return `
EXCLUSIVE BEAT LICENSE AGREEMENT

This Exclusive Beat License Agreement ("Agreement") is entered into as of ${effectiveDate} ("Effective Date") by and between:

SELLER: ${vars.producerName || '[PRODUCER NAME]'} ("Producer")
BUYER: ${vars.artistName || '[ARTIST NAME]'} ("Artist")

1. BEAT INFORMATION
Title: ${vars.beatTitle || '[BEAT TITLE]'}
BPM: ${vars.beatBpm || 'N/A'}
Key: ${vars.beatKey || 'N/A'}

2. EXCLUSIVE RIGHTS TRANSFER
Upon receipt of full payment, Producer hereby grants Artist EXCLUSIVE rights to the Beat. Producer agrees to:
- Immediately cease all sales of the Beat
- Remove the Beat from all marketplaces and platforms
- Not grant any future licenses for the Beat

3. OWNERSHIP RIGHTS
Artist receives:
- 100% of Master Recording Rights
- ${vars.publishingPercentage || 50}% of Publishing Rights (Producer retains ${100 - (vars.publishingPercentage || 50)}%)
- Right to register with PROs and collect royalties
- Right to copyright the New Song

4. USAGE RIGHTS
- Distribution: Unlimited
- Streaming: Unlimited
- Territory: ${vars.territory || 'Worldwide'}
- Performances: Unlimited
- Sync Licensing: Allowed (subject to Producer's publishing share)
- Derivative Works: Allowed

5. ROYALTIES
${vars.royaltyPercentage ? `Producer shall receive ${vars.royaltyPercentage}% of net profits from the New Song.` : 'No ongoing royalties are owed to Producer beyond the purchase price.'}

6. PAYMENT
Exclusive Purchase Price: ${currency} ${vars.purchasePrice?.toLocaleString() || '0.00'}
Payment Terms: Full payment due upon execution

7. CREDIT
Artist agrees to credit Producer as:
"Produced by ${vars.producerName || '[PRODUCER NAME]'}"

8. WARRANTIES AND REPRESENTATIONS
Producer warrants:
- Full ownership and authority to sell exclusive rights
- Beat is original and free from samples requiring clearance
- No prior exclusive licenses have been granted
- All non-exclusive licenses will be honored but no new ones issued

9. INDEMNIFICATION
Producer agrees to indemnify Artist against any claims arising from Producer's breach of warranties.

10. GOVERNING LAW
This Agreement shall be governed by the laws of the State of [STATE].

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.

SELLER: _________________________ Date: _____________
${vars.producerName || '[PRODUCER NAME]'}

BUYER: _________________________ Date: _____________
${vars.artistName || '[ARTIST NAME]'}
`;
  }

  private generateFreeDownloadLicense(vars: ContractVariables, effectiveDate: string): string {
    return `
FREE DOWNLOAD LICENSE AGREEMENT

Effective Date: ${effectiveDate}

PRODUCER: ${vars.producerName || '[PRODUCER NAME]'}
ARTIST: ${vars.artistName || '[ARTIST NAME]'}
BEAT: ${vars.beatTitle || '[BEAT TITLE]'}

1. LICENSE GRANT
Producer grants Artist a FREE, non-exclusive license to use the Beat for promotional purposes only.

2. PERMITTED USES
- Non-commercial streaming on free platforms (SoundCloud, YouTube, etc.)
- Non-monetized music videos
- Live performances (non-ticketed events)
- Promotional mixtapes (free download only)

3. RESTRICTIONS
Artist may NOT:
- Sell or monetize any song using this Beat
- Distribute on paid streaming platforms (Spotify, Apple Music, etc.)
- Use for commercial purposes of any kind
- Register with PROs for royalty collection
- Claim ownership of the Beat

4. CREDIT REQUIREMENT (MANDATORY)
Artist MUST credit Producer as follows in ALL uses:
"Produced by ${vars.producerName || '[PRODUCER NAME]'}"
"Beat available at [PRODUCER'S WEBSITE]"

5. TERM
This license may be revoked at any time by Producer with 30 days written notice.

6. UPGRADE PATH
Artist may upgrade to a paid license at any time to unlock commercial rights.

ACKNOWLEDGMENT
By downloading this Beat, Artist agrees to all terms above.

Producer: ${vars.producerName || '[PRODUCER NAME]'}
Date: ${effectiveDate}
`;
  }

  private generateNDA(vars: ContractVariables, effectiveDate: string): string {
    const periodYears = vars.confidentialPeriodYears || 2;
    return `
MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:

PARTY A: ${vars.artistName || '[PARTY A NAME]'}
PARTY B: ${vars.producerName || '[PARTY B NAME]'}

Collectively referred to as "the Parties."

1. PURPOSE
The Parties wish to explore a potential business relationship related to music production and collaboration ("Purpose"). In connection with the Purpose, each Party may disclose certain confidential information to the other Party.

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any information disclosed by either Party, including but not limited to:
- Unreleased music, beats, lyrics, and compositions
- Business plans and strategies
- Financial information
- Artist/producer relationships
- Marketing and promotional plans
- Technical information and trade secrets
- Any information marked as "confidential"

3. OBLIGATIONS
Each Party agrees to:
- Hold Confidential Information in strict confidence
- Use Confidential Information only for the Purpose
- Not disclose Confidential Information to third parties without prior written consent
- Protect Confidential Information with the same degree of care used for their own confidential information

4. EXCLUSIONS
Confidential Information does not include information that:
- Is or becomes publicly available through no fault of the receiving Party
- Was already known to the receiving Party prior to disclosure
- Is independently developed by the receiving Party
- Is lawfully obtained from a third party without restriction

5. TERM
This Agreement shall remain in effect for ${periodYears} year(s) from the Effective Date.

6. RETURN OF INFORMATION
Upon termination or request, each Party shall return or destroy all Confidential Information received from the other Party.

7. NO LICENSE
Nothing in this Agreement grants any rights to intellectual property.

8. REMEDIES
The Parties acknowledge that breach may cause irreparable harm and agree that injunctive relief may be sought in addition to other remedies.

9. GOVERNING LAW
This Agreement shall be governed by the laws of the State of [STATE].

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

PARTY A: _________________________ Date: _____________
${vars.artistName || '[PARTY A NAME]'}

PARTY B: _________________________ Date: _____________
${vars.producerName || '[PARTY B NAME]'}
`;
  }

  private generateSessionMusicianAgreement(vars: ContractVariables, effectiveDate: string, currency: string): string {
    const totalPayment = (vars.sessionRate || 0) * (vars.sessionHours || 1);
    return `
SESSION MUSICIAN AGREEMENT

This Session Musician Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:

HIRING PARTY: ${vars.artistName || '[HIRING PARTY]'} ("Artist")
SESSION MUSICIAN: ${vars.producerName || '[MUSICIAN NAME]'} ("Musician")

1. PROJECT INFORMATION
Project Title: ${vars.projectTitle || '[PROJECT TITLE]'}
Recording Session Details: As scheduled by Artist

2. SERVICES
Musician agrees to provide professional musical services including:
- Live instrumental performance
- Studio recording sessions
- Any necessary rehearsals
- Re-recording if reasonably requested

3. COMPENSATION
Session Rate: ${currency} ${vars.sessionRate?.toLocaleString() || '0.00'} per hour
Estimated Hours: ${vars.sessionHours || 1}
Total Estimated Payment: ${currency} ${totalPayment.toLocaleString()}

Payment Terms: 50% due upon signing, 50% upon completion of services

${vars.royaltyPercentage ? `
4. ROYALTIES
In addition to session fees, Musician shall receive ${vars.royaltyPercentage}% of net royalties from the recording.
` : `
4. WORK FOR HIRE
This is a work-for-hire arrangement. Musician assigns all rights to Artist.
`}

5. RIGHTS ASSIGNMENT
Musician hereby assigns to Artist all rights, title, and interest in and to:
- All recordings made during the sessions
- Any contributions to the compositions (unless otherwise agreed)
- The right to use Musician's name and likeness for promotion

6. CREDITS
Musician shall receive credit as: "Session Musician" or specific instrument played.

7. EQUIPMENT
[ ] Artist will provide all necessary equipment
[ ] Musician will provide their own equipment

8. CANCELLATION
- Cancellation with 48+ hours notice: Full refund of deposit
- Cancellation with less than 48 hours notice: Deposit forfeited
- Musician cancellation: Full refund and possible replacement

9. CONFIDENTIALITY
Musician agrees not to share unreleased material or session details.

10. WARRANTIES
Musician warrants:
- They are free to enter this Agreement
- Their performance will be original and not infringe third-party rights
- They will perform to professional standards

HIRING PARTY: _________________________ Date: _____________
${vars.artistName || '[HIRING PARTY]'}

MUSICIAN: _________________________ Date: _____________
${vars.producerName || '[MUSICIAN NAME]'}
`;
  }

  private generateMixerEngineerAgreement(vars: ContractVariables, effectiveDate: string, currency: string): string {
    const totalFee = (vars.mixingFee || 0) + (vars.masteringFee || 0);
    return `
MIXING AND MASTERING ENGINEER AGREEMENT

This Agreement is entered into as of ${effectiveDate} by and between:

CLIENT: ${vars.artistName || '[CLIENT NAME]'} ("Client")
ENGINEER: ${vars.producerName || '[ENGINEER NAME]'} ("Engineer")

1. PROJECT DETAILS
Project Title: ${vars.projectTitle || '[PROJECT TITLE]'}
Number of Tracks: [NUMBER OF TRACKS]

2. SERVICES
Engineer agrees to provide the following services:

MIXING SERVICES (if applicable):
- Professional mixing of audio tracks
- Balance, EQ, compression, and effects
- Up to ${vars.revisions || 2} rounds of revisions
- Delivery of stereo mix and stems

MASTERING SERVICES (if applicable):
- Professional mastering for distribution
- Loudness optimization
- Format conversion (WAV, MP3, etc.)
- Up to ${vars.revisions || 2} rounds of revisions

3. COMPENSATION
Mixing Fee: ${currency} ${vars.mixingFee?.toLocaleString() || '0.00'}
Mastering Fee: ${currency} ${vars.masteringFee?.toLocaleString() || '0.00'}
Total: ${currency} ${totalFee.toLocaleString()}

Payment Schedule:
- 50% deposit due upon signing
- 50% balance due upon delivery of final files

4. REVISIONS
- Included revisions: ${vars.revisions || 2} rounds
- Additional revisions: ${currency} [RATE] per revision
- Revision requests must be submitted within 7 days of delivery

5. DELIVERY
- Format: WAV (24-bit/44.1kHz or higher) + MP3
- Delivery method: Secure file transfer
- Estimated turnaround: [TURNAROUND TIME]

6. CREDITS
Engineer shall receive credit as:
"Mixed by ${vars.producerName || '[ENGINEER NAME]'}"
"Mastered by ${vars.producerName || '[ENGINEER NAME]'}"

7. RIGHTS
- Client retains full ownership of all recordings
- Engineer may use completed work for portfolio with Client consent
- Engineer retains no ownership or royalty rights

8. FILE RETENTION
Engineer will retain project files for 90 days after delivery.

9. CONFIDENTIALITY
Engineer agrees to maintain confidentiality regarding unreleased material.

10. CANCELLATION POLICY
- Cancellation before work begins: Full refund minus 10% admin fee
- Cancellation after work begins: Deposit non-refundable

CLIENT: _________________________ Date: _____________
${vars.artistName || '[CLIENT NAME]'}

ENGINEER: _________________________ Date: _____________
${vars.producerName || '[ENGINEER NAME]'}
`;
  }

  private generateSplitSheet(vars: ContractVariables, effectiveDate: string): string {
    const splits = vars.splits || [];
    const splitsTable = splits.map(s => `| ${s.name} | ${s.role} | ${s.percentage}% |`).join('\n');
    const totalPercentage = splits.reduce((sum, s) => sum + s.percentage, 0);

    return `
ROYALTY SPLIT SHEET

Date: ${effectiveDate}

SONG/BEAT INFORMATION
Title: ${vars.beatTitle || '[SONG TITLE]'}
Working Title: [IF DIFFERENT]
ISRC: [TO BE ASSIGNED]
ISWC: [TO BE ASSIGNED]

OWNERSHIP BREAKDOWN

| Contributor Name | Role | Ownership % |
|-----------------|------|-------------|
${splitsTable || '| [NAME] | [ROLE] | [%] |'}
|-----------------|------|-------------|
| TOTAL | | ${totalPercentage || 100}% |

PUBLISHING RIGHTS SPLIT
Total Publishing: ${vars.publishingPercentage || 100}%

MASTER RECORDING RIGHTS SPLIT
Total Master: ${vars.masterPercentage || 100}%

PAYMENT INFORMATION
All royalty payments shall be distributed according to the percentages above.
Each party is responsible for providing accurate payment information.

PRO AFFILIATIONS
[List each contributor's Performing Rights Organization]

AGREEMENT
By signing below, all parties agree to the ownership splits outlined above.
This Split Sheet shall be binding and may be used for copyright registration.

SIGNATURES

${splits.map(s => `
${s.name} (${s.role})
Signature: _________________________ Date: _____________
PRO: _____________ IPI#: _____________
`).join('') || `
[CONTRIBUTOR NAME]
Signature: _________________________ Date: _____________
PRO: _____________ IPI#: _____________
`}
`;
  }

  private generateSyncLicense(vars: ContractVariables, effectiveDate: string, currency: string): string {
    return `
SYNCHRONIZATION LICENSE AGREEMENT

This Synchronization License Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:

LICENSOR: ${vars.producerName || '[RIGHTS HOLDER]'} ("Licensor")
LICENSEE: ${vars.artistName || '[PRODUCTION COMPANY]'} ("Licensee")

1. LICENSED WORK
Song/Beat Title: ${vars.beatTitle || '[TITLE]'}
Composer(s): ${vars.producerName || '[COMPOSER]'}
Publisher(s): [PUBLISHER]

2. LICENSED USE
Project Title: ${vars.projectTitle || '[PROJECT TITLE]'}
Project Type: ${vars.projectType || '[FILM/TV/COMMERCIAL/VIDEO GAME]'}
Usage: Background music / Featured performance / Theme
Duration of Use: [DURATION] seconds/minutes
Territory: ${vars.territory || 'Worldwide'}

3. GRANT OF RIGHTS
Licensor grants Licensee the non-exclusive right to:
- Synchronize the Work with visual media
- Reproduce and distribute the Work as part of the Project
- Publicly perform the Work in connection with the Project
- Use the Work in trailers, promos, and advertisements for the Project

4. FEES
Synchronization Fee: ${currency} ${vars.syncFee?.toLocaleString() || '[FEE]'}
Master Use Fee: ${currency} [MASTER FEE] (if applicable)
Total: ${currency} [TOTAL]

Payment Terms: Due upon execution of this Agreement

5. TERM
This license shall be effective for:
[ ] Perpetual (in perpetuity)
[ ] Fixed Term: [TERM LENGTH]
[ ] Life of Project

6. CREDITS
Licensee agrees to include the following credit:
"[SONG TITLE]" by ${vars.producerName || '[COMPOSER]'}
Published by [PUBLISHER]

7. RESTRICTIONS
Licensee may NOT:
- Alter the Work except as necessary for synchronization
- Use the Work in projects not specified herein
- Sublicense the Work without prior written consent
- Use the Work in adult content, political advertising, or defamatory context

8. PERFORMANCE ROYALTIES
Licensor retains all performance royalties from their PRO.
Licensee shall provide cue sheets for TV/Film broadcasts.

9. WARRANTIES
Licensor warrants:
- Full authority to grant this license
- The Work does not infringe third-party rights
- No conflicts with existing agreements

10. INDEMNIFICATION
Each party agrees to indemnify the other against claims arising from breach of warranties.

11. GOVERNING LAW
This Agreement shall be governed by the laws of [JURISDICTION].

LICENSOR: _________________________ Date: _____________
${vars.producerName || '[RIGHTS HOLDER]'}

LICENSEE: _________________________ Date: _____________
${vars.artistName || '[PRODUCTION COMPANY]'}
`;
  }

  private generateWorkForHire(vars: ContractVariables, effectiveDate: string, currency: string): string {
    return `
WORK FOR HIRE AGREEMENT

This Work For Hire Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:

HIRING PARTY: ${vars.artistName || '[HIRING PARTY]'} ("Client")
CONTRACTOR: ${vars.producerName || '[CONTRACTOR]'} ("Contractor")

1. ENGAGEMENT
Client hereby engages Contractor to create the following work:
Project: ${vars.projectTitle || '[PROJECT DESCRIPTION]'}

2. WORK FOR HIRE DECLARATION
The parties agree that any and all work created by Contractor under this Agreement shall be considered "work made for hire" as defined by the Copyright Act of 1976.

In the event any work is not deemed a "work for hire," Contractor hereby irrevocably assigns to Client all rights, title, and interest in and to the work, including:
- All copyrights and renewals
- All derivative work rights
- All rights to register copyrights
- All moral rights (to the extent waivable)

3. COMPENSATION
Total Fee: ${currency} ${vars.purchasePrice?.toLocaleString() || '[AMOUNT]'}

Payment Schedule:
- Upon signing: ${currency} [AMOUNT]
- Upon completion: ${currency} [AMOUNT]

4. DELIVERABLES
Contractor shall deliver:
- [DELIVERABLE 1]
- [DELIVERABLE 2]
- All source files and project files

5. DEADLINE
Completion Date: [DATE]

6. OWNERSHIP
Client shall own all right, title, and interest in:
- All work product and deliverables
- All intellectual property created
- All drafts, notes, and materials

7. NO ROYALTIES
Contractor acknowledges that no royalties, residuals, or future payments are owed beyond the stated compensation.

8. CONTRACTOR REPRESENTATIONS
Contractor represents and warrants:
- Work will be original
- Work will not infringe any third-party rights
- Contractor has authority to enter this Agreement
- Contractor has not previously assigned these rights

9. CONFIDENTIALITY
Contractor agrees to maintain confidentiality regarding all project details.

10. CREDIT
[ ] Contractor shall receive credit as: [CREDIT]
[ ] No credit required

11. INDEMNIFICATION
Contractor shall indemnify Client against any claims arising from breach of Contractor's representations.

CLIENT: _________________________ Date: _____________
${vars.artistName || '[HIRING PARTY]'}

CONTRACTOR: _________________________ Date: _____________
${vars.producerName || '[CONTRACTOR]'}
`;
  }

  private generateProducerAgreement(vars: ContractVariables, effectiveDate: string, currency: string): string {
    return `
PRODUCER AGREEMENT

This Producer Agreement ("Agreement") is entered into as of ${effectiveDate} by and between:

ARTIST: ${vars.artistName || '[ARTIST NAME]'} ("Artist")
PRODUCER: ${vars.producerName || '[PRODUCER NAME]'} ("Producer")

1. PROJECT
Producer agrees to produce the following:
Project Title: ${vars.projectTitle || '[ALBUM/EP TITLE]'}
Number of Tracks: [NUMBER]
Recording Period: [START DATE] to [END DATE]

2. PRODUCER SERVICES
Producer shall provide:
- Beat production and composition
- Recording session oversight
- Mixing guidance (or full mixing services)
- Creative direction

3. COMPENSATION

A. ADVANCE
Advance Amount: ${currency} ${vars.advanceAmount?.toLocaleString() || '[AMOUNT]'}
Payment Schedule:
- 50% upon signing
- 50% upon delivery of masters

B. ROYALTIES
Producer shall receive:
- ${vars.royaltyPercentage || 3}% of net receipts from master recordings
- ${vars.publishingPercentage || 50}% of publishing royalties for Producer-written compositions

C. RECOUPMENT
Advances are recoupable from Producer's royalty share only.

4. RIGHTS
A. MASTER RECORDINGS
Artist owns master recordings.
Producer receives royalty points as specified above.

B. PUBLISHING
For beats/compositions created by Producer:
- Producer: ${vars.publishingPercentage || 50}%
- Artist: ${100 - (vars.publishingPercentage || 50)}%

5. CREDITS
Producer shall receive credit on all releases:
"Produced by ${vars.producerName || '[PRODUCER NAME]'}"

6. ACCOUNTING
Artist shall provide semi-annual royalty statements.
Producer has audit rights with 30 days notice.

7. SAMPLE CLEARANCE
Producer warrants all beats are original or samples are cleared.
Artist is not responsible for sample clearance costs.

8. EXCLUSIVITY
[ ] Producer is exclusive to this project during the Recording Period
[ ] Producer may work on other projects during the Recording Period

9. APPROVAL RIGHTS
Producer shall have approval over:
[ ] Final mixes
[ ] Album credits
[ ] Use in remixes or alternate versions

10. TERM
This Agreement covers the Project only.
Producer's royalty rights are perpetual.

11. GOVERNING LAW
This Agreement shall be governed by the laws of [STATE/JURISDICTION].

ARTIST: _________________________ Date: _____________
${vars.artistName || '[ARTIST NAME]'}

PRODUCER: _________________________ Date: _____________
${vars.producerName || '[PRODUCER NAME]'}
`;
  }

  getContract(contractId: string): GeneratedContract | undefined {
    return this.contracts.get(contractId);
  }

  getContractsByUser(userId: string): GeneratedContract[] {
    return Array.from(this.contracts.values()).filter(
      c => c.createdBy === userId || c.parties.some(p => p.name.includes(userId))
    );
  }

  async signContract(
    contractId: string,
    partyName: string,
    signatureData: { signatureHash: string; ipAddress: string }
  ): Promise<GeneratedContract> {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    const signatureIndex = contract.signatures.findIndex(s => s.partyName === partyName);
    if (signatureIndex === -1) {
      throw new Error('Party not found in contract');
    }

    if (contract.signatures[signatureIndex].signedAt) {
      throw new Error('Party has already signed');
    }

    contract.signatures[signatureIndex] = {
      ...contract.signatures[signatureIndex],
      signedAt: new Date(),
      signatureHash: signatureData.signatureHash,
      ipAddress: signatureData.ipAddress,
    };

    const allSigned = contract.signatures.every(s => s.signedAt);
    const someSigned = contract.signatures.some(s => s.signedAt);

    if (allSigned) {
      contract.status = 'fully_executed';
    } else if (someSigned) {
      contract.status = 'partially_signed';
    }

    this.contracts.set(contractId, contract);
    logger.info(`Contract ${contractId} signed by ${partyName}. Status: ${contract.status}`);
    return contract;
  }

  generatePDF(contractId: string): Buffer {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const lineHeight = 7;
    let y = margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(contract.title, pageWidth / 2, y, { align: 'center' });
    y += lineHeight * 2;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const lines = contract.content.split('\n');
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }

      const trimmedLine = line.trim();
      
      if (trimmedLine.match(/^[A-Z0-9]+\./)) {
        doc.setFont('helvetica', 'bold');
      } else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
        doc.setFont('helvetica', 'normal');
      } else {
        doc.setFont('helvetica', 'normal');
      }

      const splitLines = doc.splitTextToSize(trimmedLine, pageWidth - margin * 2);
      for (const splitLine of splitLines) {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(splitLine, margin, y);
        y += lineHeight;
      }
    }

    doc.addPage();
    y = margin;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SIGNATURE PAGE', pageWidth / 2, y, { align: 'center' });
    y += lineHeight * 2;

    doc.setFontSize(10);
    for (const sig of contract.signatures) {
      doc.setFont('helvetica', 'bold');
      doc.text(sig.partyName, margin, y);
      y += lineHeight;

      doc.setFont('helvetica', 'normal');
      if (sig.signedAt) {
        doc.text(`Signed: ${new Date(sig.signedAt).toLocaleString()}`, margin, y);
        y += lineHeight;
        doc.text(`Signature ID: ${sig.signatureHash?.substring(0, 16)}...`, margin, y);
      } else {
        doc.text('Status: Pending Signature', margin, y);
      }
      y += lineHeight * 2;
    }

    doc.setFontSize(8);
    doc.text(`Contract ID: ${contract.id}`, margin, doc.internal.pageSize.getHeight() - 10);
    doc.text(`Generated: ${new Date().toISOString()}`, pageWidth - margin - 60, doc.internal.pageSize.getHeight() - 10);

    return Buffer.from(doc.output('arraybuffer'));
  }
}

export const contractTemplateService = new ContractTemplateService();
