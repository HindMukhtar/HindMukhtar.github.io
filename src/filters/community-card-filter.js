const {JSDOM} = require('@tbranyen/jsdom');

// Separate the lead photo from the existing prose without changing its text.
module.exports = function communityCard(value) {
  const fragment = JSDOM.fragment(value || '');
  const image = fragment.querySelector('img');
  const photo = image ? {src: image.getAttribute('src'), alt: image.getAttribute('alt') || ''} : null;
  if (image) {
    const parent = image.parentNode;
    image.remove();
    if (parent.nodeName === 'P' && !parent.textContent.trim() && !parent.children.length) {
      parent.remove();
    }
  }
  const container = fragment.ownerDocument.createElement('div');
  container.appendChild(fragment);
  return {photo, body: container.innerHTML};
};
