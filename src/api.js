export const SESSION_MESSAGE = 'Your session may have expired. Reload the page to sign in again.';

// Cloudflare Access answers an expired session with a redirect to its sign-in page, which the browser
// reports as a network error or an HTML page. Turn all of that into one clear message.
export async function apiRequest(url, options = {}, fetchImpl = fetch) {
  let response;
  try { response = await fetchImpl(url, options); } catch { throw new Error(SESSION_MESSAGE); }
  if (response.redirected || response.type === 'opaqueredirect' || response.status === 401 || (response.status === 403 && !response.headers.get('content-type')?.includes('json'))) throw new Error(SESSION_MESSAGE);
  let data;
  try { data = await response.json(); } catch { throw new Error(SESSION_MESSAGE); }
  if (!response.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');
  return data;
}
