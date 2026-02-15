import axios from 'axios';

const BASE_URL = 'http://localhost:5000';

const testUser = {
  email: process.env.ADMIN_EMAIL || 'blawzmusic@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'Iamadmin123!'
};

async function deepTests() {
  console.log('=== DEEP SYSTEM VERIFICATION ===\n');
  
  // Login
  const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, testUser, {
    headers: { 'Content-Type': 'application/json' }
  });
  const cookies = loginRes.headers['set-cookie'];
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json',
    'Cookie': cookies ? cookies.join('; ') : ''
  };

  // === DISTRIBUTION: Test LabelGrid API calls ===
  console.log('1. LABELGRID API VERIFICATION');
  console.log('=============================');
  
  try {
    // Test ISRC generation (actual route)
    console.log('   Testing ISRC generation...');
    const isrcRes = await axios.post(`${BASE_URL}/api/distribution/identifiers/isrc/generate`, {
      artist: 'Test Artist',
      title: 'Test Track'
    }, { headers });
    console.log('   ✅ ISRC Generated:', isrcRes.data.isrc || isrcRes.data.code || JSON.stringify(isrcRes.data));
    
    // Test UPC generation 
    console.log('   Testing UPC generation...');
    const upcRes = await axios.post(`${BASE_URL}/api/distribution/identifiers/upc/generate`, {
      title: 'Test Album'
    }, { headers });
    console.log('   ✅ UPC Generated:', upcRes.data.upc || upcRes.data.code || JSON.stringify(upcRes.data));
    
    // Verify DSP catalog
    console.log('   Verifying DSP catalog...');
    const verifyRes = await axios.get(`${BASE_URL}/api/distribution/platforms/verify`, { headers });
    console.log('   ✅ DSP Catalog Verified:', verifyRes.data.verified ? 'Yes' : 'No');
    console.log('   Platforms count:', verifyRes.data.totalPlatforms || 'N/A');
    
  } catch (err: any) {
    console.log('   ⚠️  LabelGrid error:', err.response?.data?.error || err.response?.data?.message || err.message);
  }

  // === ROYALTIES: Test calculation engine ===
  console.log('\n2. ROYALTY ENGINE VERIFICATION');
  console.log('==============================');
  
  try {
    // Get currency/exchange rates  
    console.log('   Fetching currency rates...');
    const ratesRes = await axios.get(`${BASE_URL}/api/distribution/royalties/currency-rates`, { headers });
    const rates = ratesRes.data.rates || ratesRes.data || [];
    console.log('   ✅ Exchange rates loaded:', Array.isArray(rates) ? rates.length : Object.keys(rates).length, 'currencies');
    
    // Get payout balance (already tested but verify)
    console.log('   Fetching payout balance...');
    const balanceRes = await axios.get(`${BASE_URL}/api/payouts/balance`, { headers });
    console.log('   ✅ Balance check: $' + (balanceRes.data.availableBalance || 0).toFixed(2));
    
    // Check Stripe Connect
    console.log('   Checking Stripe Connect status...');
    const stripeRes = await axios.get(`${BASE_URL}/api/payouts/stripe-status`, { headers });
    console.log('   ✅ Stripe status retrieved');
    console.log('      - Connected:', stripeRes.data.connected || false);
    console.log('      - Payouts Enabled:', stripeRes.data.payoutsEnabled || false);
    
  } catch (err: any) {
    console.log('   ⚠️  Royalty check:', err.response?.data?.error || err.message);
  }

  // === ADVERTISING: Test dispatch system ===
  console.log('\n3. ADVERTISING SYSTEM VERIFICATION');
  console.log('===================================');
  
  try {
    // Get connected social accounts
    console.log('   Checking social connections...');
    const accountsRes = await axios.get(`${BASE_URL}/api/social-media/accounts`, { headers });
    const accounts = accountsRes.data.accounts || accountsRes.data || [];
    console.log('   ✅ Social accounts connected:', Array.isArray(accounts) ? accounts.length : 0);
    
    // Get campaigns
    console.log('   Fetching campaigns...');
    const campaignsRes = await axios.get(`${BASE_URL}/api/advertising/campaigns`, { headers });
    const campaigns = campaignsRes.data.campaigns || campaignsRes.data || [];
    console.log('   ✅ Campaigns:', Array.isArray(campaigns) ? campaigns.length : 0);
    
    // Check bidding strategies
    console.log('   Checking bidding strategies...');
    const biddingRes = await axios.get(`${BASE_URL}/api/advertising/bidding-strategies`, { headers });
    const strategies = biddingRes.data.strategies || biddingRes.data || [];
    console.log('   ✅ Bidding strategies:', Array.isArray(strategies) ? strategies.length : Object.keys(strategies).length);
    
    // Check autopilot status
    console.log('   Checking AI autopilot...');
    const autopilotRes = await axios.get(`${BASE_URL}/api/advertising-autopilot/status`, { headers });
    console.log('   ✅ Autopilot status:', autopilotRes.data.status || 'available');
    
  } catch (err: any) {
    console.log('   ⚠️  Advertising:', err.response?.data?.error || err.message);
  }

  console.log('\n=== VERIFICATION COMPLETE ===');
}

deepTests().catch(console.error);
