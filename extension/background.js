// Fetches cross-origin stylesheets for remap.js, which cannot read their
// rules from the page. Only hosts granted in manifest host_permissions are
// fetched; anything else (ad networks, embeds) is skipped quietly.

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "fetch-css" || !/^https?:\/\//.test(msg.url)) return;
  chrome.permissions
    .contains({ origins: [new URL(msg.url).origin + "/*"] })
    .then((allowed) => (allowed ? fetch(msg.url) : null))
    .then((res) => (res?.ok ? res.text() : null))
    .then(reply, () => reply(null));
  return true;
});
