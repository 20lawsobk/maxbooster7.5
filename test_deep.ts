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
    // Test ISRC generation (real API call)
    console.log('   Testing ISRC generation...');
    const isrcRes = await axios.post(`${BASE_URL}/api/distribution/isrc/generate`, {
      artist: 'Test Artist',
      title: 'Test Track'
    }, { headers });
    console.log('   ✅ ISRC Generated:', isrcRes.data.isrc || isrcRes.data.code);
    
    // Test UPC generation (real API call)
    console.log('   Testing UPC generation...');
    const upcRes = await axios.post(`${BASE_URL}/api/distribution/upc/generate`, {
      title: 'Test Album'
    }, { headers });
    console.log('   ✅ UPC Generated:', upcRes.data.upc || upcRes.data.code);
    
    // Verify DSP catalog
    console.log('   Verifying DSP catalog...');
    const verifyRes = await axios.get(`${BASE_URL}/api/distribution/platforms/verify`, { headers });
    console.log('   ✅ DSP Catalog Verified:', verifyRes.data.verified ? 'Yes' : 'No');
    console.log('   Platforms count:', verifyRes.data.totalPlatforms || 'N/A');
    
  } catch (err: any) {
    console.log('   ⚠️  LabelGrid API issue:', err.response?.data?.error || err.message);
  }

  // === ROYALTIES: Test calculation engine ===
  console.log('\n2. ROYALTY ENGINE VERIFICATION');
  console.log('==============================');
  
  try {
    // Get DSP rates
    console.log('   Fetching DSP rates...');
    const ratesRes = await axios.get(`${BASE_URL}/api/royalties/dsp-rates`, { headers });
    const rates = ratesRes.data.rates || ratesRes.data || [];
    console.log('   ✅ DSP Rates loaded:', Array.isArray(rates) ? rates.length : Object.keys(rates).length, 'platforms');
    
    // Get statements
    console.log('   Fetching royalty statements...');
    const statementsRes = await axios.get(`${BASE_URL}/api/royalties/statements`, { headers });
    const statements = statementsRes.data.statements || statementsRes.data || [];
    console.log('   ✅ Statements available:', Array.isArray(statements) ? statements.length : 0);
    
    // Check Stripe Connect
    console.log('   Checking Stripe Connect status...');
    const stripeRes = await axios.get(`${BASE_URL}/api/payouts/stripe-status`, { headers });
    console.log('   ✅ Stripe Integration:');
    console.log('      - Connected:', stripeRes.data.connected || false);
    console.log('      - Payouts Enabled:', stripeRes.data.payoutsEnabled || false);
    console.log('      - Account ID:', stripeRes.data.accountId ? 'Set' : 'Not set');
    
  } catch (err: any) {
    console.log('   ⚠️  Royalty check:', err.response?.data?.error || err.message);
  }

  // === ADVERTISING: Test dispatch system ===
  console.log('\n3. ADVERTISING SYSTEM VERIFICATION');
  console.log('===================================');
  
  try {
    // Get connected social accounts
    console.log('   Checking social connections...');
    const accountsRes = await axios.get(`${BASE_URL}/api/social/accounts`, { headers });
    const accounts = accountsRes.data.accounts || accountsRes.data || [];
    console.log('   ✅ Social accounts connected:', Array.isArray(accounts) ? accounts.length : 0);
    
    if (Array.isArray(accounts) && accounts.length > 0) {
      accounts.slice(0, 5).forEach((acc: any) => {
        console.log(`      - ${acc.platform}: ${acc.username || acc.profileName || 'Active'}`);
      });
    }
    
    // Check ad templates
    console.log('   Checking ad templates...');
    const templatesRes = await axios.get(`${BASE_URL}/api/advertising/templates`, { headers });
    const templates = templatesRes.data.templates || templatesRes.data || [];
    console.log('   ✅ Ad templates available:', Array.isArray(templates) ? templates.length : 0);
    
    // Check autopilot status
    console.log('   Checking AI autopilot...');
    const autopilotRes = await axios.get(`${BASE_URL}/api/advertising/autopilot/status`, { headers });
    console.log('   ✅ Autopilot available:', autopilotRes.data.available !== false);
    
  } catch (err: any) {
    console.log('   ⚠️  Advertising check:', err.response?.data?.error || err.message);
  }

  console.log('\n=== DEEP VERIFICATION COMPLETE ===');
}

deepTests().catch(console.error);
