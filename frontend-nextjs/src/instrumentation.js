// instrumentation.js (INT257: Deployment, Error Logging)
// Runs once when the server starts. `onRequestError` is called for every error thrown while serving a request
// (rendering, Route Handlers, Server Actions), so failures are logged in one place with what was requested.
// On Vercel these lines appear in the project's Logs; a monitoring service (Sentry, Datadog...) could be connected here.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.info('[echosign-next] server started');
  }
}

export async function onRequestError(error, request, context) {
  console.error(JSON.stringify({
    level: 'error',
    message: error?.message,
    digest: error?.digest,
    path: request?.path,
    method: request?.method,
    routePath: context?.routePath,
    routeType: context?.routeType,
    renderSource: context?.renderSource,
  }));
}
