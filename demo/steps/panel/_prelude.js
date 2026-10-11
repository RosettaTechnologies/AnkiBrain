/*
 * Shared prelude for every panel step file.
 *
 * The driver wraps prelude + step file in one IIFE and treats a thrown error as
 * a failed shot, so these helpers throw instead of failing quietly. They only
 * touch real DOM/React paths: no test hooks, no direct redux access.
 */
const demo = {
  inject: (payload) => window.receiveFromPython(payload),

  q: (selector) => document.querySelector(selector),

  qa: (selector) => Array.prototype.slice.call(document.querySelectorAll(selector)),

  click: (selector) => {
    const el = demo.q(selector);
    if (!el) throw new Error('missing element: ' + selector);
    el.click();
    return el;
  },

  /* Click the first element matching `selector` whose trimmed text equals
   * `text` (buttons, labels, nav items, accordion headers). */
  clickText: (text, selector) => {
    const nodes = demo.qa(selector || 'button');
    const el = nodes.find((n) => (n.textContent || '').trim() === text);
    if (!el) {
      const seen = nodes.map((n) => (n.textContent || '').trim()).filter(Boolean).slice(0, 40);
      throw new Error('no element with text "' + text + '" (saw: ' + JSON.stringify(seen) + ')');
    }
    el.click();
    return el;
  },

  /* Same, but substring match: for labels that wrap their own markup. */
  clickContaining: (text, selector) => {
    const nodes = demo.qa(selector || 'button, label');
    const el = nodes.find((n) => (n.textContent || '').includes(text));
    if (!el) throw new Error('no element containing "' + text + '"');
    el.click();
    return el;
  },

  /* React-safe value set: the native setter plus a bubbling event, which is
   * what a real keystroke produces. */
  setValue: (selector, value, eventName) => {
    const el = demo.q(selector);
    if (!el) throw new Error('missing element: ' + selector);
    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event(eventName || (el.tagName === 'SELECT' ? 'change' : 'input'),
                               { bubbles: true }));
    return el;
  },

  /* Pick an option by its visible text (native <select>). */
  selectByText: (selector, text) => {
    const el = demo.q(selector);
    if (!el) throw new Error('missing element: ' + selector);
    const option = Array.prototype.slice.call(el.options)
      .find((o) => (o.textContent || '').trim() === text);
    if (!option) throw new Error('no option "' + text + '" in ' + selector);
    return demo.setValue(selector, option.value, 'change');
  },

  /* Native <select> with no stable selector: find it by one of its options. */
  selectContaining: (optionText, selector) => {
    const selects = demo.qa(selector || 'select');
    for (const el of selects) {
      const option = Array.prototype.slice.call(el.options)
        .find((o) => (o.textContent || '').trim() === optionText);
      if (option) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(el, option.value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el;
      }
    }
    throw new Error('no select offering option "' + optionText + '"');
  },

  toggleCheckbox: (labelText) => {
    const label = demo.qa('label').find((n) => (n.textContent || '').includes(labelText));
    if (!label) throw new Error('no checkbox labelled "' + labelText + '"');
    label.click();
    return label;
  },

  /* Bottom-nav item by its visible label (only exists inside the shell). */
  nav: (label) => {
    const items = demo.qa('.BottomNav-item');
    const item = items.find((n) => (n.textContent || '').trim() === label);
    if (!item) throw new Error('no bottom-nav item "' + label + '"');
    item.click();
    return item;
  },

  /* Scroll a section into view inside the panel's scroll container. */
  scrollTo: (selector) => {
    const el = demo.q(selector);
    if (!el) throw new Error('missing element: ' + selector);
    el.scrollIntoView({ block: 'center' });
    return el;
  },

  /* Scroll until an element with this text is visible, then return it. */
  scrollToText: (text, selector) => {
    const el = demo.qa(selector || 'h1, h2, h3, h4, h5, h6, p, span, label, button, a, div')
      .find((n) => (n.textContent || '').trim() === text);
    if (!el) throw new Error('no element with text "' + text + '" to scroll to');
    el.scrollIntoView({ block: 'center' });
    return el;
  },

  text: () => document.body.innerText,
};
