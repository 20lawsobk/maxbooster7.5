__vite_ssr_exportName__("createAppLogger", () => { try { return createAppLogger } catch {} });
__vite_ssr_exportName__("logger", () => { try { return logger } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("pino", {"importedNames":["default"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("node:util", {"importedNames":["format"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("/server/logSanitizer.ts", {"importedNames":["sanitizeLogText","sanitizeLogValue"]});



const REDACT_PATHS = [
  // Headers
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  "headers.authorization",
  "headers.cookie",
  'headers["x-api-key"]',
  'headers["x-csrf-token"]',
  // Auth payloads
  "*.password",
  "*.passwordHash",
  "*.currentPassword",
  "*.newPassword",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.idToken",
  "*.apiKey",
  "*.secret",
  "*.clientSecret",
  "*.privateKey",
  "*.twoFactorSecret",
  "*.totpSecret",
  // Stripe / payments
  "*.stripeSecretKey",
  "*.stripeWebhookSecret",
  "*.cardNumber",
  "*.cvc",
  "*.cvv",
  // Generic sensitive containers
  "body.password",
  "body.token",
  "body.secret",
  "body.apiKey"
];
const transport = process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT ? { target: "pino-pretty", options: { colorize: true } } : void 0;
function createAppLogger(destination) {
  const options = {
    level: process.env.LOG_LEVEL || "info",
    hooks: {
      logMethod(args, method) {
        const clean = args.map((value) => (0,__vite_ssr_import_2__.sanitizeLogValue)(value));
        const messageIndex = typeof clean[0] === "string" ? 0 : 1;
        if (typeof clean[messageIndex] === "string") {
          const message = (0,__vite_ssr_import_2__.sanitizeLogText)((0,__vite_ssr_import_1__.format)(...clean.slice(messageIndex)));
          clean.splice(messageIndex, clean.length - messageIndex, message);
        };
        method.apply(this, clean);
      }
    },
    formatters: {
      bindings: (bindings) => ({ ...(0,__vite_ssr_import_2__.sanitizeLogValue)(bindings) }),
      log: (object) => ({ ...(0,__vite_ssr_import_2__.sanitizeLogValue)(object) })
    },
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
      remove: false
    },
    transport: destination ? void 0 : transport
  };
  const instance = destination ? (0,__vite_ssr_import_0__.default)(options, destination) : (0,__vite_ssr_import_0__.default)(options);
  const child = instance.child;
  instance.child = function(bindings, childOptions) {
    return child.call(this, { ...(0,__vite_ssr_import_2__.sanitizeLogValue)(bindings) }, childOptions);
  };
  const setBindings = instance.setBindings;
  instance.setBindings = function(bindings) {
    setBindings.call(this, { ...(0,__vite_ssr_import_2__.sanitizeLogValue)(bindings) });
  };
  return instance;
};
const logger = createAppLogger();
//# sourceURL=/workspace/maxbooster7.5/server/logger.ts
//# sourceMappingSource=vite-generated
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7Ozs7QUFJQSxNQUFNLGVBQWU7QUFBQTtBQUFBLEVBRW5CO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFFQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQTtBQUFBLEVBRUE7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUE7QUFBQSxFQUVBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Y7QUFFQSxNQUFNLFlBQ0osUUFBUSxJQUFJLGFBQWEsZ0JBQWdCLENBQUMsUUFBUSxJQUFJLG9CQUNsRCxFQUFFLFFBQVEsZUFBZSxTQUFTLEVBQUUsVUFBVSxLQUFLLEVBQUUsSUFDckQ7QUFHQyxTQUFTLGdCQUFnQixhQUFzQztBQUNwRSxRQUFNLFVBQThCO0FBQUEsSUFDcEMsT0FBTyxRQUFRLElBQUksYUFBYTtBQUFBLElBQ2hDLE9BQU87QUFBQSxNQUNMLFVBQVUsTUFBTSxRQUFRO0FBQ3RCLGNBQU0sUUFBUSxLQUFLLElBQUksY0FBUyx3Q0FBaUIsS0FBSyxDQUFDO0FBRXZELGNBQU0sZUFBZSxPQUFPLE1BQU0sQ0FBQyxNQUFNLFdBQVcsSUFBSTtBQUN4RCxZQUFJLE9BQU8sTUFBTSxZQUFZLE1BQU0sVUFBVTtBQUMzQyxnQkFBTSxhQUFVLDBDQUFnQiw4QkFBTyxHQUFHLE1BQU0sTUFBTSxZQUFZLENBQUMsQ0FBQztBQUNwRSxnQkFBTSxPQUFPLGNBQWMsTUFBTSxTQUFTLGNBQWMsT0FBTztBQUFBLFFBQ2pFO0FBQ0EsZUFBTyxNQUFNLE1BQU0sS0FBa0M7QUFBQSxNQUN2RDtBQUFBLElBQ0Y7QUFBQSxJQUNBLFlBQVk7QUFBQSxNQUNWLFVBQVUsZUFBYSxFQUFFLE1BQUcsd0NBQWlCLFFBQVEsRUFBNkI7QUFBQSxNQUNsRixLQUFLLGFBQVcsRUFBRSxNQUFHLHdDQUFpQixNQUFNLEVBQTZCO0FBQUEsSUFDM0U7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNOLE9BQU87QUFBQSxNQUNQLFFBQVE7QUFBQSxNQUNSLFFBQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFXLGNBQWMsU0FBWTtBQUFBLEVBQ3JDO0FBQ0EsUUFBTSxXQUFXLGlCQUFjLCtCQUFLLFNBQVMsV0FBVyxPQUFJLCtCQUFLLE9BQU87QUFDeEUsUUFBTSxRQUFRLFNBQVM7QUFHdkIsV0FBUyxRQUFRLFNBQWlDLFVBQVUsY0FBYztBQUN4RSxXQUFPLE1BQU0sS0FBSyxNQUFNLEVBQUUsTUFBRyx3Q0FBaUIsUUFBUSxFQUE2QixHQUFHLFlBQVk7QUFBQSxFQUNwRztBQUNBLFFBQU0sY0FBYyxTQUFTO0FBQzdCLFdBQVMsY0FBYyxTQUFVLFVBQVU7QUFDekMsZ0JBQVksS0FBSyxNQUFNLEVBQUUsTUFBRyx3Q0FBaUIsUUFBUSxFQUE2QixDQUFDO0FBQUEsRUFDckY7QUFDQSxTQUFPO0FBQ1Q7QUFFTyxNQUFNLFNBQVMsZ0JBQWdCIiwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlcyI6WyJsb2dnZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHBpbm8gZnJvbSBcInBpbm9cIjtcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gXCJub2RlOnV0aWxcIjtcbmltcG9ydCB7IHNhbml0aXplTG9nVGV4dCwgc2FuaXRpemVMb2dWYWx1ZSB9IGZyb20gXCIuL2xvZ1Nhbml0aXplci5qc1wiO1xuXG4vLyBQcm9kdWN0aW9uLWdyYWRlIHJlZGFjdGlvbiDigJQgbmV2ZXIgbGV0IHNlY3JldHMvUElJIHJlYWNoIHN0ZG91dC9sb2cgc2lua3MuXG4vLyBQYXRocyB1c2UgUGlubydzIHJlZGFjdGlvbiBzeW50YXggKGh0dHBzOi8vZ2V0cGluby5pby8jL2RvY3MvcmVkYWN0aW9uKS5cbmNvbnN0IFJFREFDVF9QQVRIUyA9IFtcbiAgLy8gSGVhZGVyc1xuICAncmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbicsXG4gICdyZXEuaGVhZGVycy5jb29raWUnLFxuICAncmVxLmhlYWRlcnNbXCJ4LWFwaS1rZXlcIl0nLFxuICAncmVxLmhlYWRlcnNbXCJ4LWNzcmYtdG9rZW5cIl0nLFxuICAnaGVhZGVycy5hdXRob3JpemF0aW9uJyxcbiAgJ2hlYWRlcnMuY29va2llJyxcbiAgJ2hlYWRlcnNbXCJ4LWFwaS1rZXlcIl0nLFxuICAnaGVhZGVyc1tcIngtY3NyZi10b2tlblwiXScsXG4gIC8vIEF1dGggcGF5bG9hZHNcbiAgJyoucGFzc3dvcmQnLFxuICAnKi5wYXNzd29yZEhhc2gnLFxuICAnKi5jdXJyZW50UGFzc3dvcmQnLFxuICAnKi5uZXdQYXNzd29yZCcsXG4gICcqLnRva2VuJyxcbiAgJyouYWNjZXNzVG9rZW4nLFxuICAnKi5yZWZyZXNoVG9rZW4nLFxuICAnKi5pZFRva2VuJyxcbiAgJyouYXBpS2V5JyxcbiAgJyouc2VjcmV0JyxcbiAgJyouY2xpZW50U2VjcmV0JyxcbiAgJyoucHJpdmF0ZUtleScsXG4gICcqLnR3b0ZhY3RvclNlY3JldCcsXG4gICcqLnRvdHBTZWNyZXQnLFxuICAvLyBTdHJpcGUgLyBwYXltZW50c1xuICAnKi5zdHJpcGVTZWNyZXRLZXknLFxuICAnKi5zdHJpcGVXZWJob29rU2VjcmV0JyxcbiAgJyouY2FyZE51bWJlcicsXG4gICcqLmN2YycsXG4gICcqLmN2dicsXG4gIC8vIEdlbmVyaWMgc2Vuc2l0aXZlIGNvbnRhaW5lcnNcbiAgJ2JvZHkucGFzc3dvcmQnLFxuICAnYm9keS50b2tlbicsXG4gICdib2R5LnNlY3JldCcsXG4gICdib2R5LmFwaUtleScsXG5dO1xuXG5jb25zdCB0cmFuc3BvcnQgPVxuICBwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gXCJwcm9kdWN0aW9uXCIgJiYgIXByb2Nlc3MuZW52LlJFUExJVF9ERVBMT1lNRU5UXG4gICAgPyB7IHRhcmdldDogXCJwaW5vLXByZXR0eVwiLCBvcHRpb25zOiB7IGNvbG9yaXplOiB0cnVlIH0gfVxuICAgIDogdW5kZWZpbmVkO1xuXG4vKiogRXhwb3J0ZWQgZm9yIGlzb2xhdGVkIGRlc3RpbmF0aW9uLWNhcHR1cmUgdGVzdHM7IHByb2R1Y3Rpb24gdXNlcyB0aGUgc2luZ2xldG9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFwcExvZ2dlcihkZXN0aW5hdGlvbj86IHBpbm8uRGVzdGluYXRpb25TdHJlYW0pIHtcbiAgY29uc3Qgb3B0aW9uczogcGluby5Mb2dnZXJPcHRpb25zID0ge1xuICBsZXZlbDogcHJvY2Vzcy5lbnYuTE9HX0xFVkVMIHx8IFwiaW5mb1wiLFxuICBob29rczoge1xuICAgIGxvZ01ldGhvZChhcmdzLCBtZXRob2QpIHtcbiAgICAgIGNvbnN0IGNsZWFuID0gYXJncy5tYXAodmFsdWUgPT4gc2FuaXRpemVMb2dWYWx1ZSh2YWx1ZSkpO1xuICAgICAgLy8gUmVkYWN0IGFmdGVyIGludGVycG9sYXRpb24gYXMgd2VsbDogXCIlc0Alc1wiIG11c3Qgbm90IHJlY29uc3RydWN0IFBJSS5cbiAgICAgIGNvbnN0IG1lc3NhZ2VJbmRleCA9IHR5cGVvZiBjbGVhblswXSA9PT0gXCJzdHJpbmdcIiA/IDAgOiAxO1xuICAgICAgaWYgKHR5cGVvZiBjbGVhblttZXNzYWdlSW5kZXhdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBzYW5pdGl6ZUxvZ1RleHQoZm9ybWF0KC4uLmNsZWFuLnNsaWNlKG1lc3NhZ2VJbmRleCkpKTtcbiAgICAgICAgY2xlYW4uc3BsaWNlKG1lc3NhZ2VJbmRleCwgY2xlYW4ubGVuZ3RoIC0gbWVzc2FnZUluZGV4LCBtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIG1ldGhvZC5hcHBseSh0aGlzLCBjbGVhbiBhcyBQYXJhbWV0ZXJzPHR5cGVvZiBtZXRob2Q+KTtcbiAgICB9LFxuICB9LFxuICBmb3JtYXR0ZXJzOiB7XG4gICAgYmluZGluZ3M6IGJpbmRpbmdzID0+ICh7IC4uLnNhbml0aXplTG9nVmFsdWUoYmluZGluZ3MpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0pLFxuICAgIGxvZzogb2JqZWN0ID0+ICh7IC4uLnNhbml0aXplTG9nVmFsdWUob2JqZWN0KSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KSxcbiAgfSxcbiAgcmVkYWN0OiB7XG4gICAgcGF0aHM6IFJFREFDVF9QQVRIUyxcbiAgICBjZW5zb3I6IFwiW1JFREFDVEVEXVwiLFxuICAgIHJlbW92ZTogZmFsc2UsXG4gIH0sXG4gIHRyYW5zcG9ydDogZGVzdGluYXRpb24gPyB1bmRlZmluZWQgOiB0cmFuc3BvcnQsXG4gIH07XG4gIGNvbnN0IGluc3RhbmNlID0gZGVzdGluYXRpb24gPyBwaW5vKG9wdGlvbnMsIGRlc3RpbmF0aW9uKSA6IHBpbm8ob3B0aW9ucyk7XG4gIGNvbnN0IGNoaWxkID0gaW5zdGFuY2UuY2hpbGQ7XG4gIC8vIFBpbm8gaW50ZW50aW9uYWxseSByZXNldHMgdGhlIGJpbmRpbmdzIGZvcm1hdHRlciBmb3IgY2hpbGRyZW4uIFNhbml0aXplXG4gIC8vIGJlZm9yZSBjaGlsZCBjcmVhdGlvbiB0b28sIGluY2x1ZGluZyBncmFuZGNoaWxkcmVuLlxuICBpbnN0YW5jZS5jaGlsZCA9IGZ1bmN0aW9uICh0aGlzOiB0eXBlb2YgaW5zdGFuY2UsIGJpbmRpbmdzLCBjaGlsZE9wdGlvbnMpIHtcbiAgICByZXR1cm4gY2hpbGQuY2FsbCh0aGlzLCB7IC4uLnNhbml0aXplTG9nVmFsdWUoYmluZGluZ3MpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0sIGNoaWxkT3B0aW9ucyk7XG4gIH0gYXMgdHlwZW9mIGluc3RhbmNlLmNoaWxkO1xuICBjb25zdCBzZXRCaW5kaW5ncyA9IGluc3RhbmNlLnNldEJpbmRpbmdzO1xuICBpbnN0YW5jZS5zZXRCaW5kaW5ncyA9IGZ1bmN0aW9uIChiaW5kaW5ncykge1xuICAgIHNldEJpbmRpbmdzLmNhbGwodGhpcywgeyAuLi5zYW5pdGl6ZUxvZ1ZhbHVlKGJpbmRpbmdzKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KTtcbiAgfTtcbiAgcmV0dXJuIGluc3RhbmNlO1xufVxuXG5leHBvcnQgY29uc3QgbG9nZ2VyID0gY3JlYXRlQXBwTG9nZ2VyKCk7XG4iXSwiZmlsZSI6Ii9zZXJ2ZXIvbG9nZ2VyLnRzIn0=
