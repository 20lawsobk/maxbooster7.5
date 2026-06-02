import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { logger } from "../logger";

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
  return `action_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

router.post("/action", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
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
        message: "Missing required fields: type, category, module, description",
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
      (a) => a.userId === req.user!.id,
    );
    if (userActions.length > 100) {
      const oldest = userActions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0];
      actionCache.delete(oldest.id);
    }

    return res.json({
      success: true,
      actionId: action.id,
      message: "Action recorded",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error recording action:");
    return res.status(500).json({ error: "Failed to record action" });
  }
});

router.post("/undo/:actionId", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { actionId } = req.params;
    const action = actionCache.get(actionId);

    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }

    if (action.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to undo this action" });
    }

    if (action.isUndone) {
      return res.status(400).json({ error: "Action already undone" });
    }

    action.isUndone = true;
    action.undoneAt = new Date();

    return res.json({
      success: true,
      actionId: action.id,
      message: "Action undone",
      restoredState: action.previousState,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error undoing action:");
    return res.status(500).json({ error: "Failed to undo action" });
  }
});

router.post("/redo/:actionId", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { actionId } = req.params;
    const action = actionCache.get(actionId);

    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }

    if (action.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to redo this action" });
    }

    if (!action.isUndone) {
      return res.status(400).json({ error: "Action has not been undone" });
    }

    action.isUndone = false;
    action.undoneAt = undefined;

    return res.json({
      success: true,
      actionId: action.id,
      message: "Action redone",
      restoredState: action.newState,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error redoing action:");
    return res.status(500).json({ error: "Failed to redo action" });
  }
});

router.get("/history", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.min(
      Math.max(parseInt(req.query.offset as string) || 0, 0),
      100_000,
    );
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
    logger.warn({ err: error }, "Error fetching action history:");
    return res.status(500).json({ error: "Failed to fetch action history" });
  }
});

router.delete("/history", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userActionIds = Array.from(actionCache.entries())
      .filter(([_, action]) => action.userId === req.user!.id)
      .map(([id]) => id);

    userActionIds.forEach((id) => actionCache.delete(id));

    return res.json({
      success: true,
      message: "History cleared",
      deletedCount: userActionIds.length,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error clearing action history:");
    return res.status(500).json({ error: "Failed to clear action history" });
  }
});

router.get("/action/:actionId", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { actionId } = req.params;
    const action = actionCache.get(actionId);

    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }

    if (action.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this action" });
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
    logger.warn({ err: error }, "Error fetching action:");
    return res.status(500).json({ error: "Failed to fetch action" });
  }
});

router.post("/record", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const {
      type,
      category = "CRUD",
      module,
      description,
      entityId,
      entityType,
      previousState,
      newState,
    } = req.body;

    if (!type || !module || !description) {
      return res.status(400).json({
        message: "Missing required fields: type, module, description",
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
      (a) => a.userId === req.user!.id,
    );
    if (userActions.length > 100) {
      const oldest = userActions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0];
      actionCache.delete(oldest.id);
    }

    return res.json({
      success: true,
      actionId: action.id,
      message: "Action recorded successfully",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error recording action:");
    return res.status(500).json({ error: "Failed to record action" });
  }
});

router.post("/revert/:actionId", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { actionId } = req.params;
    const action = actionCache.get(actionId);

    if (!action) {
      return res.status(404).json({ error: "Action not found" });
    }

    if (action.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to revert this action" });
    }

    if (action.isUndone) {
      return res
        .status(400)
        .json({ error: "Action has already been reverted" });
    }

    action.isUndone = true;
    action.undoneAt = new Date();

    return res.json({
      success: true,
      actionId: action.id,
      message: "Action reverted successfully",
      restoredState: action.previousState,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error reverting action:");
    return res.status(500).json({ error: "Failed to revert action" });
  }
});

router.post("/batch", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { actions } = req.body;

    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: "Actions array is required" });
    }

    const groupId = `group_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const recordedIds: string[] = [];

    for (const actionData of actions) {
      const action: UndoAction = {
        id: generateActionId(),
        userId: req.user.id,
        type: actionData.type,
        category: actionData.category || "CRUD",
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
    logger.warn({ err: error }, "Error batch recording actions:");
    return res.status(500).json({ error: "Failed to batch record actions" });
  }
});

interface RestorePoint {
  id: string;
  userId: string;
  name: string;
  description?: string;
  actionId: string;
  createdAt: Date;
}

interface DeletedItem {
  id: string;
  userId: string;
  actionId: string;
  type: string;
  name: string;
  data: unknown;
  deletedAt: Date;
  expiresAt: Date;
}

const restorePointCache = new Map<string, RestorePoint>();
const deletedItemCache = new Map<string, DeletedItem>();

// Global eviction: max 5K deleted items, max 10K restore points, max 100K action entries.
// Individual per-user caps are enforced inline, but this is the global safety net.
const MAX_DELETED_ITEMS = 5_000;
const MAX_RESTORE_POINTS = 10_000;
 // 30 days

setInterval(
  () => {
    const now = Date.now();
    for (const [id, item] of deletedItemCache.entries()) {
      if (item.expiresAt && new Date(item.expiresAt).getTime() < now)
        deletedItemCache.delete(id);
    }
    while (deletedItemCache.size > MAX_DELETED_ITEMS) {
      const k = deletedItemCache.keys().next().value;
      if (k !== undefined) deletedItemCache.delete(k);
      else break;
    }
    for (const [id, rp] of restorePointCache.entries()) {
      if (rp.expiresAt && new Date(rp.expiresAt).getTime() < now)
        restorePointCache.delete(id);
    }
    while (restorePointCache.size > MAX_RESTORE_POINTS) {
      const k = restorePointCache.keys().next().value;
      if (k !== undefined) restorePointCache.delete(k);
      else break;
    }
    while (actionCache.size > 100_000) {
      const k = actionCache.keys().next().value;
      if (k !== undefined) actionCache.delete(k);
      else break;
    }
  },
  60 * 60 * 1000,
).unref(); // run hourly

function generateRestorePointId(): string {
  return `restore_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

function generateDeletedItemId(): string {
  return `deleted_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

router.post("/track-action", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const {
      type,
      category = "other",
      module,
      description,
      entityId,
      entityType,
      previousState,
      newState,
      isDestructive = false,
    } = req.body;

    if (!type || !module || !description) {
      return res.status(400).json({
        message: "Missing required fields: type, module, description",
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

    if (isDestructive && previousState) {
      const deletedItem: DeletedItem = {
        id: generateDeletedItemId(),
        userId: req.user.id,
        actionId: action.id,
        type: entityType || "unknown",
        name: description,
        data: previousState,
        deletedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
      deletedItemCache.set(deletedItem.id, deletedItem);
    }

    const userActions = Array.from(actionCache.values()).filter(
      (a) => a.userId === req.user!.id,
    );
    if (userActions.length > 100) {
      const oldest = userActions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0];
      actionCache.delete(oldest.id);
    }

    return res.json({
      success: true,
      actionId: action.id,
      message: "Action tracked successfully",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error tracking action:");
    return res.status(500).json({ error: "Failed to track action" });
  }
});

router.post("/create-restore-point", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const userActions = Array.from(actionCache.values())
      .filter((a) => a.userId === req.user!.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const lastAction = userActions[0];

    const restorePoint: RestorePoint = {
      id: generateRestorePointId(),
      userId: req.user.id,
      name,
      description,
      actionId: lastAction?.id || "",
      createdAt: new Date(),
    };

    restorePointCache.set(restorePoint.id, restorePoint);

    const userRestorePoints = Array.from(restorePointCache.values()).filter(
      (rp) => rp.userId === req.user!.id,
    );
    if (userRestorePoints.length > 20) {
      const oldest = userRestorePoints.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0];
      restorePointCache.delete(oldest.id);
    }

    return res.json({
      success: true,
      restorePointId: restorePoint.id,
      message: "Restore point created successfully",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error creating restore point:");
    return res.status(500).json({ error: "Failed to create restore point" });
  }
});

router.get("/restore-points", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userRestorePoints = Array.from(restorePointCache.values())
      .filter((rp) => rp.userId === req.user!.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return res.json({
      success: true,
      restorePoints: userRestorePoints.map((rp) => ({
        id: rp.id,
        name: rp.name,
        description: rp.description,
        actionId: rp.actionId,
        createdAt: rp.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching restore points:");
    return res.status(500).json({ error: "Failed to fetch restore points" });
  }
});

router.post("/restore/:pointId", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { pointId } = req.params;
    const restorePoint = restorePointCache.get(pointId);

    if (!restorePoint) {
      return res.status(404).json({ error: "Restore point not found" });
    }

    if (restorePoint.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to use this restore point" });
    }

    const userActions = Array.from(actionCache.values())
      .filter((a) => a.userId === req.user!.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const restorePointAction = actionCache.get(restorePoint.actionId);
    const undoneActions: string[] = [];

    for (const action of userActions) {
      if (
        restorePointAction &&
        action.createdAt > restorePointAction.createdAt
      ) {
        if (!action.isUndone) {
          action.isUndone = true;
          action.undoneAt = new Date();
          undoneActions.push(action.id);
        }
      }
    }

    return res.json({
      success: true,
      restorePointId: pointId,
      undoneActions,
      message: `Restored to "${restorePoint.name}" - ${undoneActions.length} actions undone`,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error restoring to point:");
    return res.status(500).json({ error: "Failed to restore to point" });
  }
});

router.delete(
  "/restore-points/:pointId",
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { pointId } = req.params;
      const restorePoint = restorePointCache.get(pointId);

      if (!restorePoint) {
        return res.status(404).json({ error: "Restore point not found" });
      }

      if (restorePoint.userId !== req.user.id) {
        return res
          .status(403)
          .json({ error: "Not authorized to delete this restore point" });
      }

      restorePointCache.delete(pointId);

      return res.json({
        success: true,
        message: "Restore point deleted successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error deleting restore point:");
      return res.status(500).json({ error: "Failed to delete restore point" });
    }
  },
);

router.get("/deleted-items", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { type, limit = 50 } = req.query;
    const now = new Date();

    let userDeletedItems = Array.from(deletedItemCache.values()).filter(
      (item) => item.userId === req.user!.id && item.expiresAt > now,
    );

    if (type) {
      userDeletedItems = userDeletedItems.filter((item) => item.type === type);
    }

    userDeletedItems.sort(
      (a, b) => b.deletedAt.getTime() - a.deletedAt.getTime(),
    );

    const limitNum = Math.min(parseInt(limit as string) || 50, 100);

    return res.json({
      success: true,
      items: userDeletedItems.slice(0, limitNum).map((item) => ({
        id: item.id,
        actionId: item.actionId,
        type: item.type,
        name: item.name,
        deletedAt: item.deletedAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
      })),
      total: userDeletedItems.length,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching deleted items:");
    return res.status(500).json({ error: "Failed to fetch deleted items" });
  }
});

router.post("/recover/:itemId", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { itemId } = req.params;
    const deletedItem = deletedItemCache.get(itemId);

    if (!deletedItem) {
      return res.status(404).json({ error: "Deleted item not found" });
    }

    if (deletedItem.userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to recover this item" });
    }

    if (deletedItem.expiresAt < new Date()) {
      deletedItemCache.delete(itemId);
      return res
        .status(410)
        .json({ error: "Item has expired and cannot be recovered" });
    }

    const action = actionCache.get(deletedItem.actionId);
    if (action) {
      action.isUndone = true;
      action.undoneAt = new Date();
    }

    deletedItemCache.delete(itemId);

    return res.json({
      success: true,
      recoveredData: deletedItem.data,
      message: "Item recovered successfully",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error recovering item:");
    return res.status(500).json({ error: "Failed to recover item" });
  }
});

export default router;
