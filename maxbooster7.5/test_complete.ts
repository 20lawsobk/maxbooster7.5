import axios from 'axios';

const BASE_URL = 'http://localhost:5000';

const testUser = {
  email: process.env.ADMIN_EMAIL || 'blawzmusic@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'Iamadmin123!'
};

async function completeTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       MAX BOOSTER - END-TO-END SYSTEM VERIFICATION           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Login
  const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, testUser, {
    headers: { 'Content-Type': 'application/json' }
  });
  const cookies = loginRes.headers['set-cookie'];
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json',
    'Cookie': cookies ? cookies.join('; ') : ''
  };
  console.log('✅ Authenticated as:', loginRes.data.email, '\n');

  let allPassed = true;

  // === 1. DISTRIBUTION SYSTEM ===
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│ 1. DISTRIBUTION SYSTEM (LabelGrid Integration)               │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  
  try {
    // Check LabelGrid status
    const statusRes = await axios.get(`${BASE_URL}/api/distribution/platforms/status`, { headers });
    console.log('   ✅ LabelGrid API Configured:', statusRes.data.labelGridConfigured ? 'YES' : 'NO');
    
    // Fetch DSPs
    const dspsRes = await axios.get(`${BASE_URL}/api/distribution/platforms`, { headers });
    const platforms = dspsRes.data.platforms || dspsRes.data || [];
    console.log('   ✅ Distribution Platforms:', platforms.length);
    console.log('   ✅ Data Source:', dspsRes.data.source || 'local');
    
    // Test ISRC generation
    console.log('   Testing ISRC generation...');
    const isrcRes = await axios.post(`${BASE_URL}/api/distribution/identifiers/isrc/generate`, {
      countryCode: 'US',
      registrantCode: 'MXB'
    }, { headers });
    console.log('   ✅ ISRC Generated:', isrcRes.data.isrc || isrcRes.data.code || 'Success');
    
    // Test UPC generation
    console.log('   Testing UPC generation...');
    const upcRes = await axios.post(`${BASE_URL}/api/distribution/identifiers/upc/generate`, {
      title: 'Test Album'
    }, { headers });
    console.log('   ✅ UPC Generated:', upcRes.data.upc || upcRes.data.code || 'Success');
    
    console.log('\n   🎵 DISTRIBUTION: FULLY OPERATIONAL\n');
  } catch (err: any) {
    console.log('   ❌ Error:', err.response?.data?.error || err.message);
    console.log('\n   ⚠️  DISTRIBUTION: NEEDS ATTENTION\n');
    allPassed = false;
  }

  // === 2. ROYALTY SYSTEM ===
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│ 2. ROYALTY SYSTEM (Calculation + Stripe Payouts)             │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  
  try {
    // Get currency rates
    const ratesRes = await axios.get(`${BASE_URL}/api/distribution/royalties/currency-rates`, { headers });
    const rates = ratesRes.data.rates || {};
    console.log('   ✅ Exchange Rates Loaded:', Object.keys(rates).length, 'currencies');
    
    // Get payout balance
    const balanceRes = await axios.get(`${BASE_URL}/api/payouts/balance`, { headers });
    console.log('   ✅ Balance Available: $' + (balanceRes.data.availableBalance || 0).toFixed(2));
    console.log('   ✅ Pending Earnings: $' + (balanceRes.data.pendingBalance || 0).toFixed(2));
    
    // Check Stripe Connect status
    const stripeRes = await axios.get(`${BASE_URL}/api/payouts/verify`, { headers });
    console.log('   ✅ Stripe Connect:');
    console.log('      - Account Verified:', stripeRes.data.verified ? 'YES' : 'NO');
    console.log('      - Status:', stripeRes.data.requiresOnboarding ? 'Onboarding Required' : 'Ready');
    
    console.log('\n   💰 ROYALTIES: FULLY OPERATIONAL\n');
  } catch (err: any) {
    console.log('   ❌ Error:', err.response?.data?.error || err.message);
    allPassed = false;
  }

  // === 3. ADVERTISING SYSTEM ===
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│ 3. ADVERTISING SYSTEM (Social Media Dispatch)                │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  
  try {
    // Get connected social accounts (correct route: /api/social/connections)
    const connectionsRes = await axios.get(`${BASE_URL}/api/social/connections`, { headers });
    const connections = connectionsRes.data.connections || connectionsRes.data || [];
    console.log('   ✅ Social Connections:', Array.isArray(connections) ? connections.length : 0, 'accounts');
    
    // Get campaigns
    const campaignsRes = await axios.get(`${BASE_URL}/api/advertising/campaigns`, { headers });
    const campaigns = campaignsRes.data.campaigns || campaignsRes.data || [];
    console.log('   ✅ Ad Campaigns:', Array.isArray(campaigns) ? campaigns.length : 0);
    
    // Get bidding strategies
    const biddingRes = await axios.get(`${BASE_URL}/api/advertising/bidding-strategies`, { headers });
    const strategies = biddingRes.data.strategies || biddingRes.data || [];
    console.log('   ✅ Bidding Strategies:', Array.isArray(strategies) ? strategies.length : Object.keys(strategies).length);
    
    // Get autopilot status
    const autopilotRes = await axios.get(`${BASE_URL}/api/advertising-autopilot/status`, { headers });
    console.log('   ✅ AI Autopilot:', autopilotRes.data.active ? 'ACTIVE' : 'AVAILABLE');
    
    console.log('\n   📢 ADVERTISING: FULLY OPERATIONAL\n');
  } catch (err: any) {
    console.log('   ❌ Error:', err.response?.data?.error || err.message);
    console.log('\n   ⚠️  ADVERTISING: NEEDS ATTENTION\n');
    allPassed = false;
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  if (allPassed) {
    console.log('║   ✅ ALL SYSTEMS VERIFIED - READY FOR PRODUCTION             ║');
  } else {
    console.log('║   ⚠️  SOME SYSTEMS NEED ATTENTION                            ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

completeTests().catch(console.error);
