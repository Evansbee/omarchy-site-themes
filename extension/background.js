// Fetches cross-origin stylesheets for remap.js, which cannot read their
// rules from the page. Limited to the hosts in manifest host_permissions.

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "fetch-css" || !/^https?:\/\//.test(msg.url)) return;
  fetch(msg.url)
    .then((res) => (res.ok ? res.text() : null))
    .then(reply, () => reply(null));
  return true;
});
