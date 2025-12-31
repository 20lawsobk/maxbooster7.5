import { Router, Request, Response, NextFunction } from "express";

const paidRouter = Router();

// Middleware to require paid subscription
function requirePaid(req: Request, res: Response, next: NextFunction) {
    if (!req.user || req.user.subscriptionTier === "free" || req.user.subscriptionStatus !== "active") {
        return res.status(403).json({ message: "Paid subscription required" });
    }
    next();
}

// Example: Paid user dashboard
paidRouter.get("/dashboard", requirePaid, (req, res) => {
    res.json({ message: "Welcome to the paid user dashboard!", user: req.user });
});

// Example: Paid-only feature
paidRouter.get("/feature", requirePaid, (req, res) => {
    res.json({ message: "This is a paid feature." });
});

export default paidRouter;
