import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import {
  registerDevice,
  unregisterDevice,
  heartbeat,
  listDevices,
  checkForUpdate,
  getLatestVersions,
  pushUpdateNotification,
  triggerRemoteUpdate,
  pullSyncState,
  pushSyncState,
  getSyncStatus,
  getUpdateRolloutStatus,
  type PlatformType,
} from '../services/crossPlatformSyncService.js';

const router = Router();

const VALID_PLATFORMS: PlatformType[] = ['web', 'android', 'desktop'];

function isValidPlatform(p: string): p is PlatformType {
  return VALID_PLATFORMS.includes(p as PlatformType);
}

router.get('/devices', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const devices = listDevices(userId);
    res.json({ devices });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list devices');
    res.status(500).json({ error: 'Failed to list devices' });
  }
});

router.post('/devices/register', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { deviceId, platform, appVersion, osInfo, deviceName } = req.body;

    if (!deviceId || !platform || !appVersion) {
      return res.status(400).json({ error: 'deviceId, platform, and appVersion are required' });
    }

    if (!isValidPlatform(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }

    const device = registerDevice(userId, {
      deviceId,
      platform,
      appVersion,
      osInfo: osInfo || 'unknown',
      deviceName: deviceName || `${platform} device`,
    });

    res.json({ success: true, device });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to register device');
    res.status(500).json({ error: 'Failed to register device' });
  }
});

router.post('/devices/heartbeat', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const device = heartbeat(userId, deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ success: true, device });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to process heartbeat');
    res.status(500).json({ error: 'Failed to process heartbeat' });
  }
});

router.delete('/devices/:deviceId', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { deviceId } = req.params;

    const removed = unregisterDevice(userId, deviceId);
    if (!removed) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to unregister device');
    res.status(500).json({ error: 'Failed to unregister device' });
  }
});

router.get('/version/check', requireAuth, async (req, res) => {
  try {
    const platform = req.query.platform as string;
    const currentVersion = req.query.currentVersion as string;

    if (!platform || !currentVersion) {
      return res.status(400).json({ error: 'platform and currentVersion query params are required' });
    }

    if (!isValidPlatform(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }

    const versionInfo = checkForUpdate(platform, currentVersion);
    res.json(versionInfo);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to check version');
    res.status(500).json({ error: 'Failed to check version' });
  }
});

router.get('/version/latest', requireAuth, async (_req, res) => {
  try {
    const versions = getLatestVersions();
    res.json({ versions });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get latest versions');
    res.status(500).json({ error: 'Failed to get latest versions' });
  }
});

router.post('/version/notify', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { platform, version, changelog, isForced } = req.body;

    if (!platform || !version) {
      return res.status(400).json({ error: 'platform and version are required' });
    }

    if (!isValidPlatform(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }

    const notification = pushUpdateNotification(
      platform,
      version,
      changelog || '',
      isForced || false,
    );

    res.json({ success: true, notification });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to push update notification');
    res.status(500).json({ error: 'Failed to push update notification' });
  }
});

router.get('/sync/pull', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const deviceId = req.query.deviceId as string;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId query param is required' });
    }

    const result = pullSyncState(userId, deviceId);
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to pull sync state');
    res.status(500).json({ error: 'Failed to pull sync state' });
  }
});

router.post('/sync/push', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { deviceId, changes } = req.body;

    if (!deviceId || !changes) {
      return res.status(400).json({ error: 'deviceId and changes are required' });
    }

    const state = pushSyncState(userId, deviceId, changes);
    res.json({ success: true, state });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to push sync state');
    res.status(500).json({ error: 'Failed to push sync state' });
  }
});

router.get('/sync/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const statuses = getSyncStatus(userId);
    res.json({ statuses });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get sync status');
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

router.post('/remote-update/trigger', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { platform, targetVersion, isForced, changelog } = req.body;

    if (!platform || !targetVersion) {
      return res.status(400).json({ error: 'platform and targetVersion are required' });
    }

    if (!isValidPlatform(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }

    const rollout = triggerRemoteUpdate(
      platform,
      targetVersion,
      isForced || false,
      changelog || '',
      req.user!.id,
    );

    res.json({
      success: true,
      rollout: {
        id: rollout.id,
        platform: rollout.platform,
        targetVersion: rollout.targetVersion,
        isForced: rollout.isForced,
        triggeredAt: rollout.triggeredAt,
        affectedDevices: rollout.deviceStatuses.size,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to trigger remote update');
    res.status(500).json({ error: 'Failed to trigger remote update' });
  }
});

router.get('/remote-update/status', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const rollouts = getUpdateRolloutStatus();
    res.json({ rollouts });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get update rollout status');
    res.status(500).json({ error: 'Failed to get update rollout status' });
  }
});

export default router;
