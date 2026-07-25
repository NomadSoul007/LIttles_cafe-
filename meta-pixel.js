(function initializeMetaPixel(windowObject, documentObject) {
  'use strict';

  // Replace this value with the numeric Meta Pixel ID from Events Manager.
  const META_PIXEL_ID = '1707707753781522';

  if (!/^\d{5,20}$/.test(META_PIXEL_ID)) {
    return;
  }

  if (typeof windowObject.fbq === 'function') {
    return;
  }

  const fbq = function pixelQueue() {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, arguments);
      return;
    }

    fbq.queue.push(arguments);
  };

  windowObject._fbq = fbq;
  windowObject.fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];

  const pixelScript = documentObject.createElement('script');
  pixelScript.async = true;
  pixelScript.src = 'https://connect.facebook.net/en_US/fbevents.js';

  const firstScript = documentObject.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(pixelScript, firstScript);

  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
})(window, document);
