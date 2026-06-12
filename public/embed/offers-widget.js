(function () {
  function initWidget(root) {
    if (!root) return;
    var store = root.getAttribute('data-store');
    var model = root.getAttribute('data-model');
    var year = root.getAttribute('data-year');
    var condition = root.getAttribute('data-condition');
    var type = root.getAttribute('data-type');
    var contactAnchor = root.getAttribute('data-contact-anchor');
    var inactiveCtas = root.getAttribute('data-inactive-ctas');
    var endpoint =
      root.getAttribute('data-endpoint') ||
      '/api/public/offers/widget';

    if (!store || !model) {
      root.innerHTML =
        '<div data-offers-widget-error="missing-config">Missing data-store or data-model</div>';
      return;
    }

    var params = new URLSearchParams();
    params.set('store', store);
    params.set('model', model);
    if (year) params.set('year', year);
    if (condition) params.set('condition', condition);
    if (type) params.set('type', type);
    if (contactAnchor) params.set('contactAnchor', contactAnchor);
    if (inactiveCtas === 'true' || inactiveCtas === '1') params.set('inactiveCtas', '1');

    var url = endpoint + '?' + params.toString();

    root.innerHTML =
      '<div data-offers-widget-loading="true">Loading current offers…</div>';

    fetch(url)
      .then(function (res) {
        if (!res.ok) {
          throw new Error('Widget request failed with ' + res.status);
        }
        return res.text();
      })
      .then(function (html) {
        root.innerHTML = html;
      })
      .catch(function (err) {
        console.error('Offers widget error', err);
        root.innerHTML =
          '<div data-offers-widget-error="request-failed">Unable to load offers right now.</div>';
      });
  }

  function initAll() {
    var nodes = document.querySelectorAll(
      '[data-offers-widget][data-store][data-model]'
    );
    for (var i = 0; i < nodes.length; i++) {
      initWidget(nodes[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();

