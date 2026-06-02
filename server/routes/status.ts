import { Router } from "express";
import { statusPageService } from "../services/statusPageService.js";
import { z } from "zod";
import { logger } from "../logger.js";
import { notificationService } from "../services/notificationService.js";

const router = Router();

const subscribeSchema = z.object({
  email: z.string().email(),
  notifyIncidents: z.boolean().optional(),
  notifyMaintenance: z.boolean().optional(),
});

const createIncidentSchema = z.object({
  title: z.string().min(1),
  status: z
    .enum(["investigating", "identified", "monitoring", "resolved"])
    .optional(),
  impact: z.enum(["none", "minor", "major", "critical"]).optional(),
  message: z.string().min(1),
  serviceIds: z.array(z.string()).min(1),
  isScheduled: z.boolean().optional(),
  scheduledFor: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
  scheduledUntil: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
});

const updateIncidentSchema = z.object({
  status: z
    .enum(["investigating", "identified", "monitoring", "resolved"])
    .optional(),
  message: z.string().min(1),
  resolve: z.boolean().optional(),
});

const createServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  displayOrder: z.number().optional(),
  isPublic: z.boolean().optional(),
});

router.get("/", async (_req, res) => {
  try {
    const summary = await statusPageService.getStatusSummary();

    res.json(summary);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching status summary:");
    const message =
      error instanceof Error ? error.message : "Failed to fetch status";
    res.status(500).json({ error: message });
  }
});

router.get("/services", async (req, res) => {
  try {
    const publicOnly = req.query.all !== "true" || !req.user?.isAdmin;
    const services = await statusPageService.getAllServices(publicOnly);

    res.json({ services });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching services:");
    const message =
      error instanceof Error ? error.message : "Failed to fetch services";
    res.status(500).json({ error: message });
  }
});

router.get("/services/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const service = await statusPageService.getServiceBySlug(slug);

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json(service);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching service:");
    const message =
      error instanceof Error ? error.message : "Failed to fetch service";
    res.status(500).json({ error: message });
  }
});

router.get("/services/:serviceId/uptime", async (req, res) => {
  try {
    const { serviceId } = req.params;
    const days = parseInt(req.query.days as string) || 90;

    const uptime = await statusPageService.getUptimeHistory(serviceId, days);

    res.json(uptime);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching uptime history:");
    const message =
      error instanceof Error ? error.message : "Failed to fetch uptime history";
    res.status(500).json({ error: message });
  }
});

router.get("/incidents", async (_req, res) => {
  try {
    const activeIncidents = await statusPageService.getActiveIncidents();

    res.json({ incidents: activeIncidents });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching incidents:");
    const message =
      error instanceof Error ? error.message : "Failed to fetch incidents";
    res.status(500).json({ error: message });
  }
});

router.get("/incidents/:incidentId", async (req, res) => {
  try {
    const { incidentId } = req.params;
    const incident = await statusPageService.getIncidentWithDetails(incidentId);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    res.json(incident);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching incident:");
    const message =
      error instanceof Error ? error.message : "Failed to fetch incident";
    res.status(500).json({ error: message });
  }
});

router.get("/maintenance", async (_req, res) => {
  try {
    const scheduled = await statusPageService.getScheduledMaintenance();

    res.json({ maintenance: scheduled });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching scheduled maintenance:");
    const message =
      error instanceof Error ? error.message : "Failed to fetch maintenance";
    res.status(500).json({ error: message });
  }
});

router.get("/history", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const history = await statusPageService.getIncidentHistory(days);

    res.json({ incidents: history });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error fetching incident history:");
    const message =
      error instanceof Error ? error.message : "Failed to fetch history";
    res.status(500).json({ error: message });
  }
});

router.post("/subscribe", async (req, res) => {
  try {
    const validated = subscribeSchema.parse(req.body);

    const subscriber = await statusPageService.subscribe({
      email: validated.email,
      userId: req.user?.id,
      notifyIncidents: validated.notifyIncidents,
      notifyMaintenance: validated.notifyMaintenance,
    });

    res.status(201).json({
      success: true,
      subscriber: {
        id: subscriber.id,
        email: subscriber.email,
        isVerified: subscriber.isVerified,
      },
      message: subscriber.isVerified
        ? "Successfully subscribed to status updates."
        : "Please check your email to verify your subscription.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error subscribing to status updates:");

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request data",
        details: error.errors,
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to subscribe";
    res.status(500).json({ error: message });
  }
});

router.get("/verify", async (req, res) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({ error: "Verification token required" });
    }

    await statusPageService.verifySubscription(token);

    res.json({
      success: true,
      message: "Email verified. You will now receive status updates.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error verifying subscription:");
    const message =
      error instanceof Error ? error.message : "Failed to verify subscription";
    res.status(500).json({ error: message });
  }
});

router.get("/unsubscribe", async (req, res) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({ error: "Unsubscribe token required" });
    }

    await statusPageService.unsubscribe(token);

    res.json({
      success: true,
      message: "Successfully unsubscribed from status updates.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error unsubscribing:");
    const message =
      error instanceof Error ? error.message : "Failed to unsubscribe";
    res.status(500).json({ error: message });
  }
});

router.post("/admin/services", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const validated = createServiceSchema.parse(req.body);
    const service = await statusPageService.createService(validated);

    res.status(201).json({
      success: true,
      service,
      message: "Service created successfully.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error creating service:");

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request data",
        details: error.errors,
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to create service";
    res.status(500).json({ error: message });
  }
});

router.put("/admin/services/:serviceId", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { serviceId } = req.params;
    const service = await statusPageService.updateService(serviceId, req.body);

    res.json({
      success: true,
      service,
      message: "Service updated successfully.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error updating service:");
    const message =
      error instanceof Error ? error.message : "Failed to update service";
    res.status(500).json({ error: message });
  }
});

router.put("/admin/services/:serviceId/status", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { serviceId } = req.params;
    const { status } = req.body;

    const validStatuses = [
      "operational",
      "degraded_performance",
      "partial_outage",
      "major_outage",
      "maintenance",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const service = await statusPageService.updateServiceStatus(
      serviceId,
      status,
    );

    res.json({
      success: true,
      service,
      message: "Service status updated successfully.",
    });

    if (status !== "operational") {
      setImmediate(async () => {
        try {
          const statusLabel = status.replace(/_/g, " ");
          await notificationService.sendAdminHealthAlertNotification(
            (service as Record<string, unknown>)?.name || serviceId,
            statusLabel,
          );
        } catch (err) {
          logger.warn({ err: err }, "Health alert notification error:");
        }
      });
    }
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error updating service status:");
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update service status";
    res.status(500).json({ error: message });
  }
});

router.post("/admin/incidents", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const validated = createIncidentSchema.parse(req.body);

    const incident = await statusPageService.createIncident({
      ...validated,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      incident,
      message: "Incident created successfully.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error creating incident:");

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request data",
        details: error.errors,
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to create incident";
    res.status(500).json({ error: message });
  }
});

router.put("/admin/incidents/:incidentId", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { incidentId } = req.params;
    const validated = updateIncidentSchema.parse(req.body);

    const incident = await statusPageService.updateIncident(incidentId, {
      ...validated,
      createdBy: req.user.id,
    });

    res.json({
      success: true,
      incident,
      message: "Incident updated successfully.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error updating incident:");

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request data",
        details: error.errors,
      });
    }

    const message =
      error instanceof Error ? error.message : "Failed to update incident";
    res.status(500).json({ error: message });
  }
});

router.post("/admin/initialize", async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    await statusPageService.initializeDefaultServices();

    res.json({
      success: true,
      message: "Default services initialized.",
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error initializing services:");
    const message =
      error instanceof Error ? error.message : "Failed to initialize services";
    res.status(500).json({ error: message });
  }
});

export default router;
