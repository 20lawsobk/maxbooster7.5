/**
 * B-Lawz Music LLC - Business Configuration
 * LLC Number: 900126446
 */

export const BUSINESS_CONFIG = {
  company: {
    name: 'B-Lawz Music LLC',
    llcNumber: '900126446',
    type: 'Limited Liability Company',
    platform: 'Max Booster',
    tagline: 'AI-Powered Music Career Platform',
  },
  
  legal: {
    entityName: 'B-Lawz Music LLC',
    registrationNumber: '900126446',
    jurisdiction: 'United States',
  },
  
  branding: {
    platformName: 'Max Booster',
    supportEmail: 'support@maxbooster.io',
    legalEmail: 'legal@maxbooster.io',
    copyrightYear: new Date().getFullYear(),
    copyrightText: `© ${new Date().getFullYear()} B-Lawz Music LLC. All rights reserved.`,
  },
  
  helpDesk: {
    aiAssistantName: 'Max',
    aiAssistantRole: 'AI Help Desk Assistant',
    welcomeMessage: 'Hi! I\'m Max, your AI assistant for Max Booster. I\'m here to help you with any questions about music distribution, royalties, the studio, social media features, or anything else. How can I assist you today?',
    capabilities: [
      'Answer questions about platform features',
      'Guide users through distribution process',
      'Explain royalty calculations and payouts',
      'Provide studio and DAW assistance',
      'Help with social media autopilot setup',
      'Troubleshoot common issues',
      'Escalate complex issues to human support',
    ],
  },
};

export default BUSINESS_CONFIG;
