/**
 * @jest-environment jsdom
 */
// S9-04: the static share page (web/share/index.html + share.js, D44/D45) against a stubbed fetch. The page has no
// build step, so the test loads the real files: the HTML into the jsdom document, then share.js evaluated in the
// window, as a browser would after `defer`.
import * as fs from 'fs';
import * as path from 'path';

const WEB = path.join(__dirname, '..', '..', 'web', 'share');
const HTML = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(WEB, 'share.js'), 'utf8');

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv'; // 22 chars of base64url
const FUNCTIONS_URL = 'http://127.0.0.1:54321/functions/v1';

type Answer = { status: number; body: unknown } | Error;

let fetchMock: jest.Mock;

function stubFetch(answer: Answer) {
  fetchMock = jest.fn(async () => {
    if (answer instanceof Error) throw answer;
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body,
    };
  });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
}

/** Loads the page at `url` (path + query + fragment) and runs share.js; resolves once it has rendered a state. */
async function openPage(url: string) {
  window.history.replaceState(null, '', url);
  const parsed = new DOMParser().parseFromString(HTML, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  new Function(SCRIPT)();
  for (let i = 0; i < 50 && !document.body.dataset.state; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return document.body.dataset.state;
}

const text = () => document.body.textContent ?? '';

const spot = (overrides: Record<string, unknown> = {}) => ({
  name: 'Pike Rail',
  generated_name: 'Capitol Hill',
  lat: 47.6,
  lng: -122.3,
  feature_types: ['rail', 'ledge'],
  stopped: true,
  natural_speed: 3,
  notes: 'Bust after 6',
  photo_urls: ['https://cdn.test/a.jpg?token=1'],
  ...overrides,
});

const sendBody = (spots: unknown[], extra: Record<string, unknown> = {}) => ({
  kind: 'send',
  spots,
  sender: { username: 'ana', display_name: 'Ana' },
  expires_at: '2026-11-21T18:00:00.000Z',
  ...extra,
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('web/share files', () => {
  it('index.html points at the local functions URL and loads share.js with no inline script', () => {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    expect(doc.querySelector('meta[name="hitlist-functions-url"]')?.getAttribute('content')).toBe(FUNCTIONS_URL);
    expect(doc.querySelectorAll('meta[name="hitlist-functions-url"]')).toHaveLength(1);
    expect(doc.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toBe(
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src https: http:; connect-src https: http:; base-uri 'none'; form-action 'none'",
    );
    const scripts = Array.from(doc.querySelectorAll('script'));
    expect(scripts.map((s) => s.getAttribute('src'))).toEqual(['share.js']);
    expect(scripts[0].textContent).toBe('');
  });

  it('share.js never writes HTML', () => {
    expect(SCRIPT).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|setHTMLUnsafe|createContextualFragment|DOMParser/,
    );
  });
});

describe('a send link', () => {
  // D96 (S9-07 review A#8): the token goes in a text/plain POST body (a simple CORS request, no preflight), never
  // in the function's URL, so no request log keeps it
  it('POSTs the fragment token to share-preview as the body, with no headers and nothing in the URL', async () => {
    stubFetch({ status: 200, body: sendBody([spot()]) });
    await openPage(`/share/#t=${TOKEN}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${FUNCTIONS_URL}/share-preview`);
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: 'POST', body: TOKEN });
  });

  // S9-07 review A#4: pasting another link into the same tab only changes the fragment (no reload)
  it('a new fragment in the same tab loads the new link', async () => {
    const OTHER = 'ZyXwVuTsRqPoNmLkJiHgFe';
    stubFetch({ status: 200, body: sendBody([spot()]) });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('send');
    stubFetch({ status: 200, body: sendBody([spot(), spot({ name: 'Second' })]) });
    window.location.hash = `#t=${OTHER}`;
    for (let i = 0; i < 50 && document.querySelector('h1')?.textContent !== '2 spots from @ana'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(fetchMock).toHaveBeenCalledWith(`${FUNCTIONS_URL}/share-preview`, { method: 'POST', body: OTHER });
    expect(document.querySelector('h1')?.textContent).toBe('2 spots from @ana');
    expect(document.querySelectorAll('[data-testid="spot"]')).toHaveLength(2);
  });

  it('an older answer that arrives after a newer link never replaces it', async () => {
    const OTHER = 'ZyXwVuTsRqPoNmLkJiHgFe';
    let releaseFirst: () => void = () => {};
    fetchMock = jest.fn((_url: string, init: { body: string }) => {
      const answer = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (init.body === TOKEN) {
        return new Promise((resolve) => (releaseFirst = () => resolve(answer(sendBody([spot()])))));
      }
      return Promise.resolve(answer(sendBody([spot(), spot()])));
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    window.history.replaceState(null, '', `/share/#t=${TOKEN}`);
    const parsed = new DOMParser().parseFromString(HTML, 'text/html');
    document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
    new Function(SCRIPT)();
    window.location.hash = `#t=${OTHER}`;
    for (let i = 0; i < 50 && !document.body.dataset.state; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(document.querySelector('h1')?.textContent).toBe('2 spots from @ana');
    releaseFirst();
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('h1')?.textContent).toBe('2 spots from @ana');
  });

  it('renders the heading, one card per spot, tags, notes, photos, map links and the expiry', async () => {
    stubFetch({
      status: 200,
      body: sendBody([
        spot(),
        spot({
          name: null,
          generated_name: 'Fremont',
          lat: 47.65,
          lng: -122.35,
          feature_types: ['stair_set'],
          stopped: false,
          natural_speed: null,
          notes: null,
          photo_urls: ['https://cdn.test/b.jpg?token=2'],
        }),
      ]),
    });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('send');

    expect(document.querySelector('h1')?.textContent).toBe('2 spots from @ana');
    const cards = document.querySelectorAll('[data-testid="spot"]');
    expect(cards).toHaveLength(2);

    const [first, second] = Array.from(cards);
    expect(first.querySelector('h2')?.textContent).toBe('Pike Rail');
    expect(first.textContent).toContain('Rail · Ledge');
    const stopped = first.querySelector('.stopped');
    expect(stopped?.textContent).toBe('Skate stopped');
    expect(first.textContent).toContain('Natural speed: Enough');
    expect(first.textContent).toContain('Bust after 6');

    expect(second.querySelector('h2')?.textContent).toBe('Untitled · Fremont');
    expect(second.textContent).toContain('Stair set');
    expect(second.querySelector('.stopped')).toBeNull();
    expect(second.textContent).not.toContain('Natural speed');

    const imgs = Array.from(document.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(imgs).toEqual(['https://cdn.test/a.jpg?token=1', 'https://cdn.test/b.jpg?token=2']);
    // Signed URLs live 600 s: load them now, not when scrolled to.
    for (const img of Array.from(document.querySelectorAll('img'))) {
      expect(img.getAttribute('alt')).toBe('');
      expect(img.hasAttribute('loading')).toBe(false);
    }
    expect(SCRIPT).not.toMatch(/\.loading\b|lazy/); // jsdom 20 doesn't reflect img.loading, so read the source

    const maps = Array.from(first.querySelectorAll('a')).find((a) => a.textContent === 'Open in Maps');
    expect(maps?.getAttribute('href')).toBe('https://maps.apple.com/?ll=47.6,-122.3');
    const osm = Array.from(first.querySelectorAll('a')).find((a) => a.textContent === 'OpenStreetMap');
    expect(osm?.getAttribute('href')).toBe('https://www.openstreetmap.org/?mlat=47.6&mlon=-122.3#map=18/47.6/-122.3');
    expect(maps?.getAttribute('rel')).toBe('noopener noreferrer');

    expect(text()).toContain('Expires Nov 21, 2026');
  });

  it("says '1 spot', 'Untitled' with no town, 'Natural speed: None' for 0, and no map links at 0,0", async () => {
    stubFetch({
      status: 200,
      body: sendBody([spot({ name: '  ', generated_name: null, lat: 0, lng: 0, natural_speed: 0, photo_urls: [] })], {
        expires_at: null,
      }),
    });
    await openPage(`/share/#t=${TOKEN}`);
    expect(document.querySelector('h1')?.textContent).toBe('1 spot from @ana');
    expect(document.querySelector('h2')?.textContent).toBe('Untitled');
    expect(text()).toContain('Natural speed: None');
    expect(document.querySelectorAll('a')).toHaveLength(0);
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(text()).not.toContain('Expires');
  });

  it('Save to my spots reveals how to save in the app', async () => {
    stubFetch({ status: 200, body: sendBody([spot()]) });
    await openPage(`/share/#t=${TOKEN}`);
    const line = 'You need HitList and an account to save these. Open the app, then Inbox → Paste a link.';
    expect(text()).not.toContain(line);
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save to my spots');
    expect(button).toBeDefined();
    expect(button!.getAttribute('aria-expanded')).toBe('false');
    button!.click();
    expect(text()).toContain(line);
    expect(button!.getAttribute('aria-expanded')).toBe('true');
    button!.click();
    expect(text().split(line)).toHaveLength(2); // shown once
  });

  it('renders a hostile name as text', async () => {
    stubFetch({
      status: 200,
      body: sendBody([spot({ name: '<img src=x onerror=alert(1)>', notes: '<b>bold</b>', photo_urls: [] })]),
    });
    await openPage(`/share/#t=${TOKEN}`);
    expect(document.querySelector('h2')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(document.querySelector('b')).toBeNull();
    expect(text()).toContain('<b>bold</b>');
  });

  // S9-07 review A#6: every text field, not only name and notes
  it('renders hostile text in every send field as text', async () => {
    const X = '<img src=x onerror=alert(1)>';
    stubFetch({
      status: 200,
      body: sendBody([spot({ name: null, generated_name: X, feature_types: [X], notes: null, photo_urls: [] })], {
        sender: { username: null, display_name: X },
      }),
    });
    await openPage(`/share/#t=${TOKEN}`);
    expect(document.querySelector('h1')?.textContent).toBe(`1 spot from ${X}`);
    expect(document.querySelector('h2')?.textContent).toBe(`Untitled · ${X}`);
    expect(text().split(X).length - 1).toBeGreaterThanOrEqual(3);
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('never sets a link or image from a non-http(s) URL or a non-number location', async () => {
    stubFetch({
      status: 200,
      body: sendBody([
        spot({ photo_urls: ['javascript:alert(1)', 'https://cdn.test/ok.jpg'] }),
        spot({ lat: '47.6', lng: '"><x', photo_urls: [] }),
      ]),
    });
    await openPage(`/share/#t=${TOKEN}`);
    const imgs = Array.from(document.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(imgs).toEqual(['https://cdn.test/ok.jpg']);
    const [first, second] = Array.from(document.querySelectorAll('[data-testid="spot"]'));
    expect(first.querySelectorAll('a')).toHaveLength(2);
    expect(second.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows a sender with no username by display name, and none at all as just the count', async () => {
    stubFetch({ status: 200, body: sendBody([spot()], { sender: { username: null, display_name: 'Ana B' } }) });
    await openPage(`/share/#t=${TOKEN}`);
    expect(document.querySelector('h1')?.textContent).toBe('1 spot from Ana B');

    stubFetch({ status: 200, body: sendBody([spot()], { sender: null }) });
    await openPage(`/share/#t=${TOKEN}`);
    expect(document.querySelector('h1')?.textContent).toBe('1 spot');
  });

  it('reads ?t= when the fragment has none', async () => {
    stubFetch({ status: 200, body: sendBody([spot()]) });
    await openPage(`/share/?t=${TOKEN}`);
    expect(fetchMock.mock.calls[0]).toEqual([`${FUNCTIONS_URL}/share-preview`, { method: 'POST', body: TOKEN }]);
    expect(document.body.dataset.state).toBe('send');
  });
});

describe('an invite link', () => {
  it('renders the one invite line and no spots', async () => {
    stubFetch({
      status: 200,
      body: {
        kind: 'invite',
        list_name: 'Downtown',
        inviter: { username: 'ana', display_name: 'Ana' },
        expires_at: '2026-10-30T00:00:00.000Z',
      },
    });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('invite');
    expect(text()).toContain('@ana invited you to Downtown on HitList — open the app to join');
    expect(document.querySelectorAll('[data-testid="spot"]')).toHaveLength(0);
    expect(Array.from(document.querySelectorAll('button')).map((b) => b.textContent)).not.toContain(
      'Save to my spots',
    );
  });
});

describe('an invite link with hostile text', () => {
  it('renders the list name and inviter as text', async () => {
    const X = '<img src=x onerror=alert(1)>';
    stubFetch({
      status: 200,
      body: { kind: 'invite', list_name: X, inviter: { username: null, display_name: X }, expires_at: null },
    });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('invite');
    expect(text()).toContain(`${X} invited you to ${X} on HitList`);
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('a dead link', () => {
  const GONE = "This link doesn't work any more.";

  it("renders the gone line for a 404 { error: 'gone' }", async () => {
    stubFetch({ status: 404, body: { error: 'gone' } });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('gone');
    expect(text()).toContain(GONE);
  });

  it.each([
    ['no token', '/share/'],
    ['a short token', '/share/#t=abc'],
    ['a token with other characters', `/share/#t=${TOKEN.slice(0, 21)}!`],
  ])('renders the gone line for %s without fetching', async (_label, url) => {
    stubFetch({ status: 200, body: sendBody([spot()]) });
    expect(await openPage(url)).toBe('gone');
    expect(text()).toContain(GONE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the gone line for an answer it does not understand, or a send with no spots', async () => {
    stubFetch({ status: 200, body: { kind: 'other' } });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('gone');
    expect(text()).toContain(GONE);

    stubFetch({ status: 200, body: sendBody([]) });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('gone');
    expect(text()).toContain(GONE);
  });

  it("says it could not load for a 404 that isn't the function's gone (wrong functions URL, not deployed)", async () => {
    stubFetch({ status: 404, body: { message: 'Function not found' } });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('error');
    expect(text()).toContain("Couldn't load this link. Try again.");
    expect(text()).not.toContain(GONE);
  });

  it('never fetches when the functions URL is missing, so the token never goes to the page host', async () => {
    stubFetch({ status: 200, body: sendBody([spot()]) });
    const html = HTML.replace('content="http://127.0.0.1:54321/functions/v1"', 'content=""');
    window.history.replaceState(null, '', `/share/#t=${TOKEN}`);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
    new Function(SCRIPT)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.dataset.state).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('announces the state it lands in', async () => {
    stubFetch({ status: 404, body: { error: 'gone' } });
    await openPage(`/share/#t=${TOKEN}`);
    expect(document.getElementById('app')?.getAttribute('aria-live')).toBe('polite');
  });

  it('says it could not load on a network failure or a 500', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('error');
    expect(text()).toContain("Couldn't load this link. Try again.");

    stubFetch({ status: 500, body: { error: 'unavailable' } });
    expect(await openPage(`/share/#t=${TOKEN}`)).toBe('error');
    expect(text()).toContain("Couldn't load this link. Try again.");
  });
});
