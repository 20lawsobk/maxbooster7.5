import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadBillingRoutes, responseHarness } from "./helpers-inbound.mjs";

test("billing transaction routes execute cancellation, payment setup, portal, invoice, retry, refund, 3DS, and dispute contracts", async () => {
  const records = {
    routes: new Map(),
    user: { id: "buyer-1", email: "buyer@example.invalid", stripeCustomerId: "cus_buyer", subscriptionTier: "monthly" },
    writes: [],
    audit: [],
    stripe: {
      calls: [],
      subscriptionRows: [{ id: "sub_buyer", status: "active", cancel_at_period_end: false, current_period_end: 2000000000 }],
      paymentMethods: [{ id: "pm_one", card: { last4: "4242" } }],
      invoices: [],
      paymentIntent: null,
      dispute: null,
      charges: [],
    },
    stripeService: {
      calls: [],
      async createRefund(input) { this.calls.push(["createRefund", input]); return { success: true, refundId: "refund_local" }; },
      async getRefundStatus(id) { this.calls.push(["getRefundStatus", id]); return { id, userId: "buyer-1", status: "succeeded" }; },
      async getOrderRefunds(orderId, userId) { this.calls.push(["getOrderRefunds", orderId, userId]); return [{ id: "refund_local" }]; },
    },
  };
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return { limit: async () => records.user ? [records.user] : [] };
            },
          };
        },
      };
    },
    update() {
      return {
        set(change) {
          records.writes.push(change);
          const chain = {
            async where() { return []; },
            async returning() { return [{ ...records.user, ...change }]; },
          };
          return chain;
        },
      };
    },
    insert() {
      return {
        values: async value => { records.audit.push(value); return []; },
      };
    },
  };
  const stripe = {
    customers: {
      async create(input) { records.stripe.calls.push(["customers.create", input]); return { id: "cus_created" }; },
    },
    checkout: {
      sessions: {
        async create(input, options) {
          records.stripe.calls.push(["checkout.sessions.create", input, options]);
          return { id: `cs_${records.stripe.calls.length}`, url: "https://checkout.invalid/setup" };
        },
      },
    },
    billingPortal: {
      sessions: {
        async create(input) { records.stripe.calls.push(["billingPortal.sessions.create", input]); return { url: "https://billing.invalid/portal" }; },
      },
    },
    subscriptions: {
      async list(input) {
        records.stripe.calls.push(["subscriptions.list", input]);
        return { data: records.stripe.subscriptionRows };
      },
      async update(id, input) { records.stripe.calls.push(["subscriptions.update", id, input]); return { id, ...input }; },
      async cancel(id, input) { records.stripe.calls.push(["subscriptions.cancel", id, input]); return { id, status: "canceled" }; },
    },
    paymentMethods: {
      async list(input) { records.stripe.calls.push(["paymentMethods.list", input]); return { data: records.stripe.paymentMethods }; },
      async detach(id) { records.stripe.calls.push(["paymentMethods.detach", id]); return { id, detached: true }; },
    },
    invoices: {
      async list(input) { records.stripe.calls.push(["invoices.list", input]); return { data: records.stripe.invoices, has_more: false }; },
      async retrieve(id) {
        records.stripe.calls.push(["invoices.retrieve", id]);
        if (id === "missing") throw Object.assign(new Error("missing"), { code: "resource_missing" });
        return records.stripe.invoices.find(invoice => invoice.id === id) || records.stripe.invoice;
      },
      async pay(id, input, options) {
        records.stripe.calls.push(["invoices.pay", id, input, options]);
        if (records.stripe.payNeeds3ds) throw Object.assign(new Error("authenticate"), { code: "authentication_required" });
        return { id, status: "paid" };
      },
    },
    paymentIntents: {
      async retrieve(id) { records.stripe.calls.push(["paymentIntents.retrieve", id]); return records.stripe.paymentIntent; },
      async confirm(id, input) {
        records.stripe.calls.push(["paymentIntents.confirm", id, input]);
        return records.stripe.confirmedPaymentIntent;
      },
    },
    charges: {
      async list(input) { records.stripe.calls.push(["charges.list", input]); return { data: records.stripe.charges }; },
      async retrieve(id) {
        records.stripe.calls.push(["charges.retrieve", id]);
        if (id === "missing") throw Object.assign(new Error("missing"), { code: "resource_missing" });
        return records.stripe.charge;
      },
    },
    disputes: {
      async retrieve(id) { records.stripe.calls.push(["disputes.retrieve", id]); return records.stripe.dispute; },
      async update(id, input) { records.stripe.calls.push(["disputes.update", id, input]); return { id, ...input }; },
    },
  };
  await loadBillingRoutes({ ...records, db, stripe });

  const invoke = async (method, path, { body = {}, params = {}, query = {}, headers = {}, user = records.user } = {}) => {
    const handler = records.routes.get(`${method} ${path}`);
    assert.equal(typeof handler, "function", `route ${method} ${path} is registered`);
    const res = responseHarness();
    await handler({
      body,
      params,
      query,
      user,
      get: name => headers[name] ?? headers[name.toLowerCase()],
    }, res);
    return res;
  };

  const listedMethods = await invoke("GET", "/payment-method");
  assert.equal(listedMethods.statusCode, 200);
  assert.deepEqual(records.stripe.calls.at(-1), ["paymentMethods.list", { customer: "cus_buyer", type: "card", limit: 1 }]);

  const setup = await invoke("POST", "/update-payment");
  assert.equal(setup.body.url, "https://checkout.invalid/setup");
  assert.equal(records.stripe.calls.at(-1)[1].mode, "setup");
  assert.deepEqual(records.stripe.calls.at(-1)[1].metadata, { userId: "buyer-1" });

  const portal = await invoke("POST", "/create-portal-session");
  assert.equal(portal.body.url, "https://billing.invalid/portal");
  assert.deepEqual(records.stripe.calls.at(-1)[1], { customer: "cus_buyer", return_url: "https://maxbooster.replit.app/settings" });

  const cancel = await invoke("POST", "/cancel-subscription", { body: { reason: "too_expensive" } });
  assert.equal(cancel.body.code, "SUBSCRIPTION_CANCELLING");
  assert.deepEqual(records.stripe.calls.at(-1), ["subscriptions.update", "sub_buyer", {
    cancel_at_period_end: true, metadata: { cancellationReason: "too_expensive" },
  }]);
  records.stripe.subscriptionRows = [{ id: "sub_buyer", status: "active", cancel_at_period_end: false, current_period_end: 2000000000 }];
  const immediateCancel = await invoke("POST", "/cancel-subscription", { body: { immediately: true } });
  assert.equal(immediateCancel.body.code, "SUBSCRIPTION_CANCELLED_IMMEDIATELY");
  assert.deepEqual(records.stripe.calls.at(-1), ["subscriptions.cancel", "sub_buyer", { prorate: true }]);

  records.stripe.subscriptionRows = [{ id: "sub_buyer", status: "active", cancel_at_period_end: true, current_period_end: 2000000000 }];
  const reactivated = await invoke("POST", "/reactivate-subscription");
  assert.equal(reactivated.body.code, "SUBSCRIPTION_REACTIVATED");
  assert.deepEqual(records.stripe.calls.at(-1), ["subscriptions.update", "sub_buyer", { cancel_at_period_end: false }]);

  records.stripe.subscriptionRows = [{ id: "sub_buyer", status: "active" }];
  const blockedDetach = await invoke("DELETE", "/payment-method");
  assert.equal(blockedDetach.body.code, "ACTIVE_SUBSCRIPTION_EXISTS");
  records.stripe.subscriptionRows = [];
  records.stripe.paymentMethods = [{ id: "pm_one" }, { id: "pm_two" }];
  const detached = await invoke("DELETE", "/payment-method");
  assert.equal(detached.body.code, "PAYMENT_METHOD_REMOVED");
  assert.deepEqual(records.stripe.calls.filter(call => call[0] === "paymentMethods.detach").map(call => call[1]), ["pm_one", "pm_two"]);

  const baseInvoice = {
    id: "in_paid", customer: "cus_buyer", status: "paid", number: "INV-1",
    amount_due: 4900, amount_paid: 4900, amount_remaining: 0, currency: "usd",
    created: 1700000000, due_date: 2000000000, charge: "ch_paid", invoice_pdf: "https://files.invalid/invoice.pdf",
    hosted_invoice_url: "https://billing.invalid/invoice", lines: { data: [{ description: "Monthly plan" }] },
    status_transitions: { paid_at: 1700000100 }, attempt_count: 1,
  };
  records.stripe.invoices = [baseInvoice];
  const history = await invoke("GET", "/history");
  assert.equal(history.statusCode, 200);
  assert.equal(records.stripe.calls.at(-1)[0], "invoices.list");
  const invoices = await invoke("GET", "/invoices", { query: { status: "paid", limit: "10" } });
  assert.equal(invoices.body.invoices[0].amount, 49);
  assert.equal(invoices.body.invoices[0].statusDisplay, "Paid");
  assert.deepEqual(records.stripe.calls.at(-1)[1], { customer: "cus_buyer", limit: 10, status: "paid" });
  const download = await invoke("GET", "/invoices/:invoiceId/download", { params: { invoiceId: "in_paid" } });
  assert.equal(download.redirectTo, baseInvoice.invoice_pdf);
  records.stripe.invoices.push({ ...baseInvoice, id: "in_other", customer: "cus_someone_else" });
  const actuallyDenied = await invoke("GET", "/invoices/:invoiceId/download", { params: { invoiceId: "in_other" } });
  assert.equal(actuallyDenied.statusCode, 403);
  const missingDownload = await invoke("GET", "/invoices/:invoiceId/download", { params: { invoiceId: "missing" } });
  assert.equal(missingDownload.statusCode, 404);

  records.stripe.subscriptionRows = [{ id: "sub_due", status: "past_due", latest_invoice: "in_due" }];
  records.stripe.invoices.push({ ...baseInvoice, id: "in_due", status: "open", payment_intent: "pi_due" });
  const retried = await invoke("POST", "/retry-payment");
  assert.equal(retried.body.code, "PAYMENT_SUCCESS");
  const payCall = records.stripe.calls.findLast(call => call[0] === "invoices.pay");
  assert.deepEqual(payCall, ["invoices.pay", "in_due", {}, { idempotencyKey: "retry-pay-buyer-1-in_due" }]);
  records.stripe.payNeeds3ds = true;
  records.stripe.paymentIntent = { id: "pi_due", client_secret: "pi_secret_contract" };
  const retry3ds = await invoke("POST", "/retry-payment");
  assert.equal(retry3ds.statusCode, 402);
  assert.equal(retry3ds.body.clientSecret, "pi_secret_contract");
  records.stripe.payNeeds3ds = false;

  const writesBefore3dsSuccess = records.writes.length;
  records.stripe.paymentIntent = { id: "pi_auth", status: "succeeded", customer: "cus_buyer" };
  const alreadySucceeded = await invoke("POST", "/3ds/confirm", { body: { paymentIntentId: "pi_auth" } });
  assert.equal(alreadySucceeded.body.code, "3DS_SUCCESS");
  assert.equal(records.writes.length, writesBefore3dsSuccess, "an already-succeeded arbitrary PaymentIntent must not grant subscription entitlements");
  records.stripe.paymentIntent = { id: "pi_auth", status: "requires_action", customer: { id: "cus_buyer" }, client_secret: "pi_action_secret" };
  records.stripe.confirmedPaymentIntent = { id: "pi_auth", status: "succeeded", customer: { id: "cus_buyer" } };
  const confirmed = await invoke("POST", "/3ds/confirm", { body: { paymentIntentId: "pi_auth", paymentMethodId: "pm_auth" } });
  assert.equal(confirmed.body.status, "succeeded");
  assert.equal(records.writes.length, writesBefore3dsSuccess, "confirming an arbitrary PaymentIntent must not activate the user subscription");
  assert.deepEqual(records.stripe.calls.findLast(call => call[0] === "paymentIntents.confirm"), [
    "paymentIntents.confirm", "pi_auth", { payment_method: "pm_auth" },
  ]);
  const callsBeforeForeignIntent = records.stripe.calls.filter(call => call[0] === "paymentIntents.confirm").length;
  const writesBeforeForeignIntent = records.writes.length;
  records.stripe.paymentIntent = {
    id: "pi_foreign", status: "requires_action", customer: { id: "cus_victim" }, client_secret: "victim_secret",
  };
  const foreignIntent = await invoke("POST", "/3ds/confirm", {
    body: { paymentIntentId: "pi_foreign", paymentMethodId: "pm_attacker" },
  });
  assert.equal(foreignIntent.statusCode, 403);
  assert.equal(foreignIntent.body.code, "PAYMENT_INTENT_OWNERSHIP_MISMATCH");
  assert.equal(foreignIntent.body.clientSecret, undefined, "foreign client secrets must never be returned");
  assert.equal(records.stripe.calls.filter(call => call[0] === "paymentIntents.confirm").length, callsBeforeForeignIntent);
  assert.equal(records.writes.length, writesBeforeForeignIntent, "a foreign intent must not update account billing state");
  records.stripe.paymentIntent = { id: "pi_unowned", status: "requires_action", customer: null, client_secret: "unowned_secret" };
  const unownedIntent = await invoke("POST", "/3ds/confirm", {
    body: { paymentIntentId: "pi_unowned", paymentMethodId: "pm_attacker" },
  });
  assert.equal(unownedIntent.statusCode, 403);
  assert.equal(unownedIntent.body.clientSecret, undefined);
  assert.equal(records.stripe.calls.filter(call => call[0] === "paymentIntents.confirm").length, callsBeforeForeignIntent);

  records.stripe.paymentIntent = { id: "pi_auth", status: "requires_action", customer: "cus_buyer", client_secret: "still_action" };
  records.stripe.confirmedPaymentIntent = { id: "pi_auth", status: "requires_action", customer: "cus_buyer", client_secret: "still_action" };
  assert.equal((await invoke("POST", "/3ds/confirm", { body: { paymentIntentId: "pi_auth", paymentMethodId: "pm_auth" } })).statusCode, 402);
  records.stripe.paymentIntent = { id: "pi_auth", status: "canceled", customer: "cus_buyer" };
  assert.equal((await invoke("POST", "/3ds/confirm", { body: { paymentIntentId: "pi_auth" } })).body.code, "3DS_CANCELLED");
  records.stripe.paymentIntent = { id: "pi_auth", status: "requires_payment_method", customer: "cus_buyer", last_payment_error: { message: "declined", decline_code: "do_not_honor" } };
  assert.equal((await invoke("POST", "/3ds/confirm", { body: { paymentIntentId: "pi_auth" } })).body.declineCode, "do_not_honor");

  const invalidRefund = await invoke("POST", "/refund", { body: { orderId: "order-1", amountCents: -1 } });
  assert.equal(invalidRefund.statusCode, 400);
  const refund = await invoke("POST", "/refund", {
    body: { orderId: "order-1", amountCents: 1200, reason: "requested_by_customer" },
    headers: { "Idempotency-Key": "refund-command-1" },
  });
  assert.equal(refund.body.refundId, "refund_local");
  assert.deepEqual(records.stripeService.calls.at(-1), ["createRefund", {
    orderId: "order-1", userId: "buyer-1", amountCents: 1200,
    reason: "requested_by_customer", initiatedBy: "customer", idempotencyKey: "refund-command-1",
  }]);
  const requestRefund = await invoke("POST", "/refund/request", {
    body: { invoiceId: "in_paid", reason: "service_issue", amount: 1200, description: "Service unavailable" },
  });
  assert.equal(requestRefund.body.code, "REFUND_REQUESTED");
  assert.equal(records.audit.at(-1).action, "refund_request_submitted");
  assert.equal(records.audit.at(-1).details.amount, 12);
  assert.equal((await invoke("GET", "/refund/:refundId", { params: { refundId: "refund_local" } })).body.status, "succeeded");
  records.stripeService.getRefundStatus = async id => ({ id, userId: "another-user" });
  assert.equal((await invoke("GET", "/refund/:refundId", { params: { refundId: "refund_foreign" } })).statusCode, 403);
  assert.deepEqual((await invoke("GET", "/order/:orderId/refunds", { params: { orderId: "order-1" } })).body.refunds, [{ id: "refund_local" }]);

  records.stripe.dispute = {
    id: "dp_1", charge: "ch_1", amount: 4900, currency: "usd", reason: "product_not_received",
    status: "needs_response", created: 1700000000, evidence_details: { due_by: 2000000000, has_evidence: false, submission_count: 0 },
  };
  records.stripe.charges = [{ id: "ch_1", dispute: "dp_1", description: "Subscription" }];
  records.stripe.charges[0].refunds = { data: [{
    id: "re_1", amount: 1200, status: "succeeded", reason: "requested_by_customer", created: 1700000001,
  }] };
  const refundHistory = await invoke("GET", "/refunds");
  assert.equal(refundHistory.body.refunds[0].statusDisplay, "Completed");
  assert.equal(refundHistory.body.refunds[0].amount, 12);
  const disputes = await invoke("GET", "/disputes");
  assert.equal(disputes.body.disputes[0].id, "dp_1");
  assert.equal(disputes.body.disputes[0].statusDisplay, "Action Required");
  records.stripe.charge = { id: "ch_1", customer: "cus_buyer" };
  const evidence = await invoke("POST", "/dispute/evidence", {
    body: { disputeId: "dp_1", evidence: { customer_name: "Buyer", product_description: "Monthly plan", submit: true } },
  });
  assert.equal(evidence.body.code, "EVIDENCE_SUBMITTED");
  assert.deepEqual(records.stripe.calls.findLast(call => call[0] === "disputes.update"), [
    "disputes.update", "dp_1", { evidence: { customer_name: "Buyer", product_description: "Monthly plan" }, submit: true },
  ]);
  records.stripe.charge = { id: "ch_1", customer: "cus_other" };
  assert.equal((await invoke("POST", "/dispute/evidence", {
    body: { disputeId: "dp_1", evidence: { customer_name: "Buyer" } },
  })).statusCode, 403);
});