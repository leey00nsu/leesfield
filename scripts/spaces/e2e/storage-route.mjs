import { localStorageConfiguration } from "../local-storage-transport.mjs";

export async function routeStorage(context) {
  const configuration = localStorageConfiguration(process.env);
  if (!configuration) return;
  const { origin, fixture, token } = configuration;
  await context.route(`${origin.origin}/**`, async route => {
    const target = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(target.pathname + target.search, fixture).href,
      headers: { ...route.request().headers(), "x-spaces-storage-token": token }, maxRedirects: 0 });
    try {
      // Materialize bytes while the API response is alive. Fulfillment owns
      // its body instead of retaining a handle into APIRequestContext storage.
      const body = await response.body();
      await route.fulfill({ status: response.status(), headers: response.headers(), body });
    } finally { await response.dispose(); }
  });
}

// APIRequestContext does not run browser routes. Read the same real bytes from
// the fixture when a test inspects a preview URL directly.
export function storageRead(request, url) {
  const configuration = localStorageConfiguration(process.env);
  const target = new URL(url);
  return request.get(configuration && target.origin === configuration.origin.origin
    ? new URL(target.pathname + target.search, configuration.fixture).href : url);
}
