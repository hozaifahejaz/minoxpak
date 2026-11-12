/* Loads Google Analytics 4 and the Meta Pixel when their IDs are set in config.js, and forwards
   the store's own events (pushed to window.dataLayer) to both. With no IDs it does nothing. */
(function(){
  var cfg = window.MINOXPAK || {}, ga = cfg.ga4Id, px = cfg.metaPixelId;
  window.dataLayer = window.dataLayer || [];
  window.mxSend = function(){};
  if (!ga && !px) return;
  function load(src){ var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }

  if (ga) {
    load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga));
    window.gtag = function(){ window.dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', ga);
  }
  if (px) {
    var n = window.fbq = function(){ n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    load('https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', px);
    fbq('track', 'PageView');
  }

  // store event name -> [GA4 event, Meta standard event]
  var MAP = {
    quiz_start:      ['quiz_start', null],
    quiz_complete:   ['quiz_complete', 'Lead'],
    view_plans:      ['view_item_list', 'ViewContent'],
    add_to_cart:     ['add_to_cart', 'AddToCart'],
    begin_checkout:  ['begin_checkout', 'InitiateCheckout'],
    order_placed:    ['purchase', 'Purchase'],
    upsell_accepted: ['upsell_accepted', null]
  };
  function send(d){
    if (!d || typeof d !== 'object' || Array.isArray(d) || !d.event || !MAP[d.event] || d._sent) return;
    d._sent = true;
    var m = MAP[d.event], value = d.total || d.price, params = { currency: 'PKR' };
    if (value) params.value = value;
    if (d.ref) params.transaction_id = d.ref;
    if (d.id) params.item_id = d.id;
    if (ga && window.gtag) gtag('event', m[0], params);
    if (px && m[1]) fbq('track', m[1], value ? { value: value, currency: 'PKR', content_ids: d.id ? [d.id] : (d.items || []).map(function(i){ return i.id; }) } : {}, d.ref ? { eventID: d.ref } : undefined);
  }
  // The store calls window.mxSend for each event (see track() in index.html); catch up on any sent before this loaded.
  window.dataLayer.forEach(send);
  window.mxSend = send;
})();
