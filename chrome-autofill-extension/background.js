chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'autofill-page') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    let profile = null;
    try {
      const res = await fetch('http://localhost:3000/api/profile', { cache: 'no-store' });
      if (res.ok) profile = await res.json();
    } catch {}

    if (!profile) {
      const stored = await chrome.storage.local.get(['ankushProfile']);
      profile = stored.ankushProfile;
    }
    if (!profile) return;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (p) => window.__ankushAutoFill && window.__ankushAutoFill(p),
      args: [profile]
    });
  } catch (err) {
    console.error('Autofill command failed:', err);
  }
});

