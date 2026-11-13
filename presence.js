// RADIO_PRESENCE_APPROX_V1
// Compteur approximatif de presence sur 2 minutes.
(() => {
  'use strict';

  const ROOT =
    'https://countapi.mileshilliard.com/api/v1';
  const PREFIX =
    'radio_des_ia_html5_presence_2min_v1_';

  const WINDOW_MS = 120000;
  const seen = new Set();

  async function setup() {
    try {
      const response = await fetch('./config.json', {
        cache: 'no-store'
      });
      if (response.ok) {
        const config = await response.json();

        // Le vrai compteur WebSocket reste prioritaire.
        if (config.backend_url) return;
      }
    } catch (_) {}

    const count = document.getElementById('connected');
    if (!count || !count.parentElement) return;

    const badge = count.parentElement;

    badge.replaceChildren(
      count,
      document.createTextNode(
        ' visiteurs récents (≈ 2 min)'
      )
    );

    badge.title =
      'Estimation des onglets actifs pendant une ' +
      'periode de deux minutes.';

    let busy = false;

    async function actualiser() {
      if (busy) return;

      if (document.visibilityState !== 'visible') {
        count.textContent = '—';
        return;
      }

      busy = true;

      const period = Math.floor(
        Date.now() / WINDOW_MS
      );

      const key = PREFIX + period;
      const localKey = 'radio_presence_' + period;

      let counted = seen.has(period);

      try {
        counted ||= sessionStorage.getItem(
          localKey
        ) === '1';
      } catch (_) {}

      const action = counted ? 'get' : 'hit';

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(), 6000
      );

      try {
        const response = await fetch(
          ROOT + '/' + action + '/' + key,
          {
            cache: 'no-store',
            credentials: 'omit',
            signal: controller.signal
          }
        );

        if (!response.ok) {
          throw Error('Compteur indisponible');
        }

        const data = await response.json();
        const n = Number(data.value);

        if (!Number.isSafeInteger(n) || n < 0) {
          throw Error('Valeur invalide');
        }

        if (action === 'hit') {
          seen.add(period);

          try {
            sessionStorage.setItem(
              localKey, '1'
            );
          } catch (_) {}
        }

        count.textContent =
          n.toLocaleString('fr-FR');

      } catch (_) {
        count.textContent = '—';

      } finally {
        clearTimeout(timeout);
        busy = false;
      }
    }

    await actualiser();

    setInterval(actualiser, 30000);

    document.addEventListener(
      'visibilitychange', actualiser
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded', setup, {once: true}
    );
  } else {
    setup();
  }
})();
