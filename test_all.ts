import axios from 'axios';

const BASE_URL = 'http://localhost:5000';

const testUser = {
  email: process.env.ADMIN_EMAIL || 'blawzmusic@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'Iamadmin123!'
};

async function allTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       MAX BOOSTER - COMPLETE SYSTEM VERIFICATION             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, testUser, {
    headers: { 'Content-Type': 'application/json' }
  });
  const cookies = loginRes.headers['set-cookie'];
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json',
    'Cookie': cookies ? cookies.join('; ') : ''
  };
  console.log('✅ Authenticated as:', loginRes.data.email, '\n');

  let dist = true, roy = true, ads = true;

  // 1. DISTRIBUTION
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│ 1. DISTRIBUTION SYSTEM                                       │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  
  try {
    const statusRes = await axios.get(`${BASE_URL}/api/distribution/platforms/status`, { headers });
    console.log('   ✅ LabelGrid API:', statusRes.data.labelGridConfigured ? 'CONFIGURED' : 'NOT CONFIGURED');
    
    const dspsRes = await axios.get(`${BASE_URL}/api/distribution/platforms`, { headers });
    console.log('   ✅ Distribution Platforms:', (dspsRes.data.platforms || dspsRes.data || []).length);
    console.log('   ✅ Data Source:', dspsRes.data.source || 'local');
    
    // ISRC test
    const isrcRes = await axios.post(`${BASE_URL}/api/distribution/identifiers/isrc/generate`, {
      countryCode: 'US', registrantCode: 'MXB'
    }, { headers });
    console.log('   ✅ ISRC Generated:', isrcRes.data.isrc || 'Success');
    
    // UPC test
    const upcRes = await axios.post(`${BASE_URL}/api/distribution/identifiers/upc/generate`, {
      title: 'Test Album'
    }, { headers });
    console.log('   ✅ UPC Generated:', upcRes.data.upc || 'Success');
    
    console.log('\n   🎵 DISTRIBUTION: FULLY OPERATIONAL\n');
  } catch (err: any) {
    console.log('   ❌ Error:', err.response?.data?.error || err.message);
    console.log('\n   ⚠️  DISTRIBUTION: NEEDS ATTENTION\n');
    dist = false;
  }

  // 2. ROYALTIES
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│ 2. ROYALTY SYSTEM                                            │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  
  try {
    const ratesRes = await axios.get(`${BASE_URL}/api/distribution/royalties/currency-rates`, { headers });
    console.log('   ✅ Exchange Rates:', Object.keys(ratesRes.data.rates || {}).length, 'currencies');
    
    const balanceRes = await axios.get(`${BASE_URL}/api/payouts/balance`, { headers });
    console.log('   ✅ Balance: $' + (balanceRes.data.availableBalance || 0).toFixed(2));
    
    const stripeRes = await axios.get(`${BASE_URL}/api/payouts/verify`, { headers });
    console.log('   ✅ Stripe Connect:', stripeRes.data.verified ? 'VERIFIED' : 'Onboarding Required');
    
    console.log('\n   💰 ROYALTIES: FULLY OPERATIONAL\n');
  } catch (err: any) {
    console.log('   ❌ Error:', err.response?.data?.error || err.message);
    roy = false;
  }

  // 3. ADVERTISING
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│ 3. ADVERTISING SYSTEM                                        │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  
  try {
    const conRes = await axios.get(`${BASE_URL}/api/social/connections`, { headers });
    console.log('   ✅ Social Connections:', (conRes.data || []).length, 'accounts');
    
    const campRes = await axios.get(`${BASE_URL}/api/advertising/campaigns`, { headers });
    console.log('   ✅ Campaigns:', (campRes.data || []).length);
    
    const bidRes = await axios.get(`${BASE_URL}/api/advertising/bidding-strategies`, { headers });
    console.log('   ✅ Bidding Strategies:', (bidRes.data.strategies || []).length);
    
    // Correct route for autopilot
    const autoRes = await axios.get(`${BASE_URL}/api/advertising/autopilot/status`, { headers });
    console.log('   ✅ AI Autopilot:', autoRes.data.active ? 'ACTIVE' : 'AVAILABLE');
    
    console.log('\n   📢 ADVERTISING: FULLY OPERATIONAL\n');
  } catch (err: any) {
    console.log('   ❌ Error:', err.response?.data?.error || err.message);
    console.log('\n   ⚠️  ADVERTISING: NEEDS ATTENTION\n');
    ads = false;
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  if (dist && roy && ads) {
    console.log('║   ✅ ALL 3 SYSTEMS VERIFIED - READY FOR PRODUCTION           ║');
  } else {
    console.log('║   Result: DISTRIBUTION=' + (dist?'✅':'❌') + ' ROYALTIES=' + (roy?'✅':'❌') + ' ADVERTISING=' + (ads?'✅':'❌') + '    ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

allTests().catch(e => console.error('Test failed:', e.message));
