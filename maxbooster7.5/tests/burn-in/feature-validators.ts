import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { logger } from '../../server/logger.ts';

interface ValidationResult {
  category: string;
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

export class FeatureValidators {
  private baseUrl = 'http://localhost:5000';
  private axiosClient: AxiosInstance;
  private testUserEmail = 'test.monthly@maxbooster.com';
  private testUserPassword = process.env.TEST_USER_PASSWORD || 'TestUser123!@#';
  private isAuthenticated = false;
  private cookieJar: CookieJar;

  constructor() {
    this.cookieJar = new CookieJar();

    const client = axios.create({
      baseURL: this.baseUrl,
      withCredentials: true,
      maxRedirects: 0,
      validateStatus: (status) => status < 500,
      jar: this.cookieJar,
    });

    this.axiosClient = wrapper(client);
  }

  async authenticate(): Promise<boolean> {
    if (this.isAuthenticated) {
      return true;
    }

    try {
      const response = await this.axiosClient.post('/api/auth/login', {
        username: this.testUserEmail,
        password: this.testUserPassword,
      });

      if (response.status === 200) {
        this.isAuthenticated = true;
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Authentication failed:', error);
      return false;
    }
  }

  private async runTest(
    category: string,
    testName: string,
    testFn: () => Promise<any>
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    try {
      const details = await testFn();
      return {
        category,
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details,
      };
    } catch (error: any) {
      return {
        category,
        testName,
        passed: false,
        duration: Date.now() - startTime,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  async validateAuthentication(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Authentication', 'Session Validation', async () => {
        const response = await this.axiosClient.get('/api/auth/me');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { user: response.data.email };
      })
    );

    results.push(
      await this.runTest('Authentication', 'Session Persistence', async () => {
        const response1 = await this.axiosClient.get('/api/auth/me');
        const response2 = await this.axiosClient.get('/api/auth/me');
        if (response1.status !== 200 || response2.status !== 200) {
          throw new Error('Session not persisting across requests');
        }
        return { persistent: true };
      })
    );

    results.push(
      await this.runTest('Authentication', 'Password Reset Endpoint', async () => {
        const response = await this.axiosClient.post('/api/auth/forgot-password', {
          email: this.testUserEmail,
        });
        if (response.status >= 400 && response.status !== 404) {
          throw new Error(`HTTP ${response.status}`);
        }
        return { status: response.status };
      })
    );

    return results;
  }

  async validatePayments(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Payments', 'Marketplace Stripe Connect Status', async () => {
        const response = await this.axiosClient.get('/api/marketplace/connect/status');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { connectStatus: response.data };
      })
    );

    results.push(
      await this.runTest('Payments', 'Marketplace Earnings', async () => {
        const response = await this.axiosClient.get('/api/marketplace/earnings');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { earnings: response.data };
      })
    );

    results.push(
      await this.runTest('Payments', 'Marketplace Payouts', async () => {
        const response = await this.axiosClient.get('/api/marketplace/payouts');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { payouts: response.data };
      })
    );

    return results;
  }

  async validateAdvertising(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Advertising', 'List Campaigns', async () => {
        const response = await this.axiosClient.get('/api/advertising/campaigns');
        if (response.status !== 200 && response.status !== 403) {
          throw new Error(`HTTP ${response.status}`);
        }
        return { accessible: response.status === 200 || response.status === 403 };
      })
    );

    results.push(
      await this.runTest('Advertising', 'AI Content Generation', async () => {
        const response = await this.axiosClient.post('/api/advertising/generate-content', {
          platform: 'twitter',
          tone: 'engaging',
          includeHashtags: true,
        });
        if (response.status !== 200 && response.status !== 403) {
          throw new Error(`HTTP ${response.status}`);
        }
        return { accessible: response.status === 200 || response.status === 403 };
      })
    );

    results.push(
      await this.runTest('Advertising', 'AI Insights', async () => {
        const response = await this.axiosClient.get('/api/advertising/ai-insights');
        if (response.status !== 200 && response.status !== 403) {
          throw new Error(`HTTP ${response.status}`);
        }
        return { accessible: response.status === 200 || response.status === 403 };
      })
    );

    return results;
  }

  async validateSocialMedia(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Social Media', 'Platform Status', async () => {
        const response = await this.axiosClient.get('/api/social/platform-status');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { platforms: response.data };
      })
    );

    results.push(
      await this.runTest('Social Media', 'Posts List', async () => {
        const response = await this.axiosClient.get('/api/social/posts');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { posts: response.data.length || 0 };
      })
    );

    results.push(
      await this.runTest('Social Media', 'Scheduled Posts', async () => {
        const response = await this.axiosClient.get('/api/social/scheduled-posts');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { scheduled: response.data.length || 0 };
      })
    );

    results.push(
      await this.runTest('Social Media', 'Social Analytics', async () => {
        const response = await this.axiosClient.get('/api/social/analytics');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { analytics: response.data };
      })
    );

    return results;
  }

  async validateDistribution(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Distribution', 'Available Providers', async () => {
        const response = await this.axiosClient.get('/api/distribution/providers');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { providers: response.data };
      })
    );

    results.push(
      await this.runTest('Distribution', 'Releases List', async () => {
        const response = await this.axiosClient.get('/api/distribution/releases');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { releases: response.data.length || 0 };
      })
    );

    results.push(
      await this.runTest('Distribution', 'Distribution Analytics', async () => {
        const response = await this.axiosClient.get('/api/distribution/analytics');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { analytics: response.data };
      })
    );

    return results;
  }

  async validateMarketplace(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Marketplace', 'Browse Listings', async () => {
        const response = await this.axiosClient.get('/api/marketplace/listings');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { listings: response.data.length || 0 };
      })
    );

    results.push(
      await this.runTest('Marketplace', 'User Beats', async () => {
        const response = await this.axiosClient.get('/api/marketplace/my-beats');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { myBeats: response.data.length || 0 };
      })
    );

    results.push(
      await this.runTest('Marketplace', 'Stripe Connect Status', async () => {
        const response = await this.axiosClient.get('/api/marketplace/connect/status');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { status: response.data };
      })
    );

    return results;
  }

  async validateStudio(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Studio', 'Projects List', async () => {
        const response = await this.axiosClient.get('/api/studio/projects');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { projects: response.data.length || 0 };
      })
    );

    results.push(
      await this.runTest('Studio', 'Recent Files', async () => {
        const response = await this.axiosClient.get('/api/studio/recent-files');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { files: response.data.length || 0 };
      })
    );

    results.push(
      await this.runTest('Studio', 'Samples Library', async () => {
        const response = await this.axiosClient.get('/api/studio/samples');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { samples: response.data.length || 0 };
      })
    );

    return results;
  }

  async validateAnalytics(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Analytics', 'Dashboard Data', async () => {
        const response = await this.axiosClient.get('/api/analytics/dashboard');
        if (response.status !== 200 && response.status !== 403) {
          throw new Error(`HTTP ${response.status}`);
        }
        return { accessible: response.status === 200 || response.status === 403 };
      })
    );

    results.push(
      await this.runTest('Analytics', 'Streams Analytics', async () => {
        const response = await this.axiosClient.get('/api/analytics/streams');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { analytics: response.data };
      })
    );

    results.push(
      await this.runTest('Analytics', 'AI Autopilot Health', async () => {
        const response = await this.axiosClient.get('/api/monitoring/ai-models');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { aiHealth: response.data };
      })
    );

    return results;
  }

  async validateInfrastructure(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(
      await this.runTest('Infrastructure', 'Database Health', async () => {
        const response = await this.axiosClient.get('/api/monitoring/system-health');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { healthy: response.data.healthy };
      })
    );

    results.push(
      await this.runTest('Infrastructure', 'Redis Cache', async () => {
        const response = await this.axiosClient.get('/api/monitoring/queue-metrics');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { metrics: response.data };
      })
    );

    results.push(
      await this.runTest('Infrastructure', 'Queue Health', async () => {
        const response = await this.axiosClient.get('/api/monitoring/queue-health');
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return { healthy: response.data.healthy };
      })
    );

    return results;
  }

  async validateAllFeatures(): Promise<{
    totalTests: number;
    passed: number;
    failed: number;
    successRate: number;
    results: ValidationResult[];
  }> {
    logger.info('🔍 Starting comprehensive feature validation...');

    const authenticated = await this.authenticate();
    if (!authenticated) {
      logger.error('❌ Failed to authenticate - aborting feature validation');
      return {
        totalTests: 1,
        passed: 0,
        failed: 1,
        successRate: 0,
        results: [
          {
            category: 'Authentication',
            testName: 'Initial Login',
            passed: false,
            duration: 0,
            error: 'Failed to authenticate with test user credentials',
          },
        ],
      };
    }

    const allResults = await Promise.all([
      this.validateAuthentication(),
      this.validatePayments(),
      this.validateAdvertising(),
      this.validateSocialMedia(),
      this.validateDistribution(),
      this.validateMarketplace(),
      this.validateStudio(),
      this.validateAnalytics(),
      this.validateInfrastructure(),
    ]);

    const results = allResults.flat();

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const totalTests = results.length;
    const successRate = totalTests > 0 ? (passed / totalTests) * 100 : 0;

    logger.info(`✅ Feature validation complete: ${passed}/${totalTests} passed (${successRate.toFixed(1)}%)`);

    return {
      totalTests,
      passed,
      failed,
      successRate,
      results,
    };
  }
}
