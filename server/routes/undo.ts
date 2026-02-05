import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

interface UndoAction {
  id: string;
  userId: string;
  type: string;
  category: string;
  module: string;
  description: string;
  entityId?: string;
  entityType?: string;
  previousState?: unknown;
  newState?: unknown;
  isUndone: boolean;
  createdAt: Date;
  undoneAt?: Date;
}

const actionCache = new Map<string, UndoAction>();

function generateActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

router.post('/action', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const {
      type,
      category,
      module,
      description,
      entityId,
      entityType,
      previousState,
      newState,
    } = req.body;

    if (!type || !category || !module || !description) {
      return res.status(400).json({
        message: 'Missing required fields: type, category, module, description',
      });
    }

    const action: UndoAction = {
      id: generateActionId(),
      userId: req.user.id,
      type,
      category,
      module,
      description,
      entityId,
      entityType,
      previousState,
      newState,
      isUndone: false,
      createdAt: new Date(),
    };

    actionCache.set(action.id, action);

    const userActions = Array.from(actionCache.values()).filter(
      (a) => a.userId === req.user!.id
    );
    if (userActions.length > 100) {
      const oldest = userActions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      actionCache.delete(oldest.id);
    }

    return res.json({
      success: true,
      actionId: action.id,
      message: 'Action recorded',
    });
  } catch (error) {
    console.error('Error recording action:', error);
    return res.status(500).json({ message: 'Failed to record action' });
  }
});

router.post('/undo/:actionId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { actionId } = req.params;
    const action = actionCache.get(actionId);

    if (!action) {
      return res.status(404).json({ message: 'Action not found' });
    }

    if (action.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to undo this action' });
    }

    if (action.isUndone) {
      return res.status(400).json({ message: 'Action already undone' });
    }

    action.isUndone = true;
    action.undoneAt = new Date();

    return res.json({
      success: true,
      actionId: action.id,
      message: 'Action undone',
      restoredState: action.previousState,
    });
  } catch (error) {
    console.error('Error undoing action:', error);
    return res.status(500).json({ message: 'Failed to undo action' });
  }
});

router.post('/redo/:actionId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { actionId } = req.params;
    const action = actionCache.get(actionId);

    if (!action) {
      return res.status(404).json({ message: 'Action not found' });
    }

    if (action.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to redo this action' });
    }

    if (!action.isUndone) {
      return res.status(400).json({ message: 'Action has not been undone' });
    }

    action.isUndone = false;
    action.undoneAt = undefined;

    return res.json({
      success: true,
      actionId: action.id,
      message: 'Action redone',
      restoredState: action.newState,
    });
  } catch (error) {
    console.error('Error redoing action:', error);
    return res.status(500).json({ message: 'Failed to redo action' });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const category = req.query.category as string | undefined;
    const module = req.query.module as string | undefined;

    let userActions = Array.from(actionCache.values())
      .filter((a) => a.userId === req.user!.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (category) {
      userActions = userActions.filter((a) => a.category === category);
    }

    if (module) {
      userActions = userActions.filter((a) => a.module === module);
    }

    const paginatedActions = userActions.slice(offset, offset + limit);

    return res.json({
      actions: paginatedActions.map((action) => ({
        id: action.id,
        type: action.type,
        category: action.category,
        module: action.module,
        description: action.description,
        entityId: action.entityId,
        entityType: action.entityType,
        isUndone: action.isUndone,
        createdAt: action.createdAt.toISOString(),
        undoneAt: action.undoneAt?.toISOString(),
        canUndo: !action.isUndone,
      })),
      total: userActions.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching action history:', error);
    return res.status(500).json({ message: 'Failed to fetch action history' });
  }
});

router.delete('/history', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userActionIds = Array.from(actionCache.entries())
      .filter(([_, action]) => action.userId === req.user!.id)
      .map(([id]) => id);

    userActionIds.forEach((id) => actionCache.delete(id));

    return res.json({
      success: true,
      message: 'History cleared',
      deletedCount: userActionIds.length,
    });
  } catch (error) {
    console.error('Error clearing action history:', error);
    return res.status(500).json({ message: 'Failed to clear action history' });
  }
});

router.get('/action/:actionId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { actionId } = req.params;
    const action = actionCache.get(actionId);

    if (!action) {
      return res.status(404).json({ message: 'Action not found' });
    }

    if (action.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this action' });
    }

    return res.json({
      id: action.id,
      type: action.type,
      category: action.category,
      module: action.module,
      description: action.description,
      entityId: action.entityId,
      entityType: action.entityType,
      previousState: action.previousState,
      newState: action.newState,
      isUndone: action.isUndone,
      createdAt: action.createdAt.toISOString(),
      undoneAt: action.undoneAt?.toISOString(),
      canUndo: !action.isUndone,
    });
  } catch (error) {
    console.error('Error fetching action:', error);
    return res.status(500).json({ message: 'Failed to fetch action' });
  }
});

router.post('/record', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const {
      type,
      category = 'CRUD',
      module,
      description,
      entityId,
      entityType,
      previousState,
      newState,
      metadata,
    } = req.body;

    if (!type || !module || !description) {
      return res.status(400).json({
        message: 'Missing required fields: type, module, description',
      });
    }

    const action: UndoAction = {
      id: generateActionId(),
      userId: req.user.id,
      type,
      category,
      module,
      description,
      entityId,
      entityType,
      previousState,
      newState,
      isUndone: false,
      createdAt: new Date(),
    };

    actionCache.set(action.id, action);

    const userActions = Array.from(actionCache.values()).filter(
      (a) => a.userId === req.user!.id
    );
    if (userActions.length > 100) {
      const oldest = userActions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      actionCache.delete(oldest.id);
    }

    return res.json({
      success: true,
      actionId: action.id,
      message: 'Action recorded successfully',
    });
  } catch (error) {
    console.error('Error recording action:', error);
    return res.status(500).json({ message: 'Failed to record action' });
  }
});

router.post('/revert/:actionId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { actionId } = req.params;
    const action = actionCache.get(actionId);

    if (!action) {
      return res.status(404).json({ message: 'Action not found' });
    }

    if (action.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to revert this action' });
    }

    if (action.isUndone) {
      return res.status(400).json({ message: 'Action has already been reverted' });
    }

    action.isUndone = true;
    action.undoneAt = new Date();

    return res.json({
      success: true,
      actionId: action.id,
      message: 'Action reverted successfully',
      restoredState: action.previousState,
    });
  } catch (error) {
    console.error('Error reverting action:', error);
    return res.status(500).json({ message: 'Failed to revert action' });
  }
});

router.post('/batch', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { actions, groupName } = req.body;

    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ message: 'Actions array is required' });
    }

    const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const recordedIds: string[] = [];

    for (const actionData of actions) {
      const action: UndoAction = {
        id: generateActionId(),
        userId: req.user.id,
        type: actionData.type,
        category: actionData.category || 'CRUD',
        module: actionData.module,
        description: actionData.description,
        entityId: actionData.entityId,
        entityType: actionData.entityType,
        previousState: actionData.previousState,
        newState: actionData.newState,
        isUndone: false,
        createdAt: new Date(),
      };

      actionCache.set(action.id, action);
      recordedIds.push(action.id);
    }

    return res.json({
      success: true,
      groupId,
      actionIds: recordedIds,
      message: `Recorded ${recordedIds.length} actions`,
    });
  } catch (error) {
    console.error('Error batch recording actions:', error);
    return res.status(500).json({ message: 'Failed to batch record actions' });
  }
});

export default router;
