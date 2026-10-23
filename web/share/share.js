// HitList share page (S9-04, D44/D45; plan docs/plans/2026-10-22-s9-links.md "Page"). No build, no framework.
// Reads the link's token from the fragment (#t=, so the static host never sees it; ?t= as a fallback), asks the
// share-preview Edge Function for the link's JSON (a POST whose text/plain body is the token, D96: never in a URL) and renders a send's frozen spots, an invite's one line, or the gone
// line. Every field from the answer goes in with textContent; URLs only from http(s) values and numbers.
(function () {
  'use strict';

  // Copied from the app: src/constants/labels.ts FEATURE_TYPE_LABELS and SPEED_LABELS.
  const FEATURE_TYPE_LABELS = {
    rail: 'Rail',
    ledge: 'Ledge',
    bank: 'Bank',
    hip: 'Hip',
    stair_set: 'Stair set',
    gap: 'Gap',
    wall_ride: 'Wall ride',
    quarter_pipe: 'Quarter pipe',
  };
  const SPEED_LABELS = ['None', 'Little', 'Some', 'Enough', 'Too much'];

  const GONE = "This link doesn't work any more.";
  const FAILED = "Couldn't load this link. Try again.";
  const SAVE_HELP = 'You need HitList and an account to save these. Open the app, then Inbox → Paste a link.';
  /** 16 random bytes as base64url (the app's newToken). */
  const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

  function readToken() {
    const match = /[#&]t=([^&]*)/.exec(location.hash) || /[?&]t=([^&#]*)/.exec(location.search);
    const token = match ? match[1] : '';
    return TOKEN_RE.test(token) ? token : null;
  }

  function functionsUrl() {
    const meta = document.querySelector('meta[name="hitlist-functions-url"]');
    return ((meta && meta.getAttribute('content')) || '').replace(/\/+$/, '');
  }

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function str(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function num(value) {
    return typeof value === 'number' && isFinite(value) ? value : null;
  }

  function isHttpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
  }

  /** '@ana', else the display name, else null. */
  function who(person) {
    if (!person || typeof person !== 'object') return null;
    const username = str(person.username);
    return username ? '@' + username : str(person.display_name);
  }

  function featureLabel(type) {
    if (Object.prototype.hasOwnProperty.call(FEATURE_TYPE_LABELS, type)) return FEATURE_TYPE_LABELS[type];
    const words = type.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function expiresLine(expiresAt) {
    const date = typeof expiresAt === 'string' ? new Date(expiresAt) : null;
    if (!date || isNaN(date.getTime())) return null;
    return 'Expires ' + date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function show(state, nodes) {
    const app = document.getElementById('app');
    while (app.firstChild) app.removeChild(app.firstChild);
    nodes.forEach(function (node) {
      app.appendChild(node);
    });
    document.body.dataset.state = state;
  }

  function spotCard(spot) {
    const card = el('section', null, 'card');
    card.setAttribute('data-testid', 'spot');

    const name = str(spot.name);
    const town = str(spot.generated_name);
    card.appendChild(el('h2', name || (town ? 'Untitled · ' + town : 'Untitled')));

    const types = Array.isArray(spot.feature_types)
      ? spot.feature_types.filter(function (t) {
          return typeof t === 'string' && t;
        })
      : [];
    if (types.length) card.appendChild(el('p', types.map(featureLabel).join(' · '), 'tags'));
    if (spot.stopped === true) card.appendChild(el('p', 'Skate stopped', 'tags stopped'));
    const speed = num(spot.natural_speed);
    if (speed !== null && SPEED_LABELS[speed]) card.appendChild(el('p', 'Natural speed: ' + SPEED_LABELS[speed], 'tags'));

    const notes = str(spot.notes);
    if (notes) card.appendChild(el('p', notes, 'notes'));

    const urls = Array.isArray(spot.photo_urls) ? spot.photo_urls.filter(isHttpUrl) : [];
    if (urls.length) {
      const photos = el('div', null, 'photos');
      urls.forEach(function (url) {
        const img = el('img');
        img.src = url;
        img.alt = ''; // eager: the signed URLs live 600 s, so don't wait for a scroll
        photos.appendChild(img);
      });
      card.appendChild(photos);
    }

    // No location is stored as 0,0 (the app's NO_LOCATION): no map links then.
    const lat = num(spot.lat);
    const lng = num(spot.lng);
    if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) {
      const links = el('p', null, 'links');
      const apple = el('a', 'Open in Maps');
      apple.href = 'https://maps.apple.com/?ll=' + lat + ',' + lng;
      const osm = el('a', 'OpenStreetMap');
      osm.href = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=18/' + lat + '/' + lng;
      [apple, osm].forEach(function (a) {
        a.rel = 'noopener noreferrer';
        links.appendChild(a);
      });
      card.appendChild(links);
    }
    return card;
  }

  function renderSend(body) {
    const spots = Array.isArray(body.spots)
      ? body.spots.filter(function (s) {
          return s && typeof s === 'object' && !Array.isArray(s);
        })
      : [];
    if (!spots.length) return show('gone', [el('h1', GONE)]);
    const from = who(body.sender);
    const count = spots.length + (spots.length === 1 ? ' spot' : ' spots');
    const nodes = [el('h1', from ? count + ' from ' + from : count)];
    const expires = expiresLine(body.expires_at);
    if (expires) nodes.push(el('p', expires, 'muted'));
    spots.forEach(function (spot) {
      nodes.push(spotCard(spot));
    });

    const footer = el('footer');
    const save = el('button', 'Save to my spots');
    save.type = 'button';
    save.setAttribute('aria-expanded', 'false');
    save.addEventListener('click', function () {
      if (footer.querySelector('p')) return;
      footer.appendChild(el('p', SAVE_HELP));
      save.setAttribute('aria-expanded', 'true');
    });
    footer.appendChild(save);
    nodes.push(footer);
    show('send', nodes);
  }

  function renderInvite(body) {
    const inviter = who(body.inviter) || 'Someone';
    const list = str(body.list_name) || 'a hit list';
    show('invite', [el('h1', inviter + ' invited you to ' + list + ' on HitList — open the app to join')]);
  }

  // Only the newest load renders: a link pasted into the same tab changes only the fragment (no reload).
  const runs = { latest: 0 };

  function main() {
    const mine = ++runs.latest;
    const current = function () {
      return mine === runs.latest;
    };
    const token = readToken();
    if (!token) return Promise.resolve(show('gone', [el('h1', GONE)]));
    // A missing or relative functions URL would send the token to this page's own host: never fetch then.
    const base = functionsUrl();
    if (!isHttpUrl(base)) return Promise.resolve(show('error', [el('h1', FAILED)]));
    // a simple CORS request (text/plain body, no headers): no preflight
    return fetch(base + '/share-preview', { method: 'POST', body: token })
      .then(function (res) {
        // Only the function's own {"error":"gone"} 404 is gone; the gateway's 404 (a wrong URL, not deployed) is not.
        if (res.status === 404) {
          return res.json().then(function (body) {
            if (body && body.error === 'gone') return null;
            throw new Error('share-preview 404');
          });
        }
        if (!res.ok) throw new Error('share-preview ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (!current()) return;
        if (body && body.kind === 'send') renderSend(body);
        else if (body && body.kind === 'invite') renderInvite(body);
        else show('gone', [el('h1', GONE)]);
      })
      .catch(function () {
        if (current()) show('error', [el('h1', FAILED)]);
      });
  }

  window.addEventListener('hashchange', main);
  main();
})();
