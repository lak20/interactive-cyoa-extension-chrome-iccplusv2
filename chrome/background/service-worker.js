chrome.runtime.onInstalled.addListener(async () => {
  await chrome.action.disable();
  await chrome.action.setBadgeBackgroundColor(
    { color: '#FFFFFF' }
  );
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId: details.tabId });
    const frameIds = frames.map((frame) => frame.frameId);
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: frameIds },
      func: pageScript,
      args: [chrome.runtime.id],
      world: chrome.scripting.ExecutionWorld.MAIN
    });
  } catch (e) { }
});

chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
  const tabId = sender.tab.id;

  switch (message.type) {
    case 'activate':
      await chrome.action.enable(tabId);
      await chrome.action.setBadgeText({ text: 'ON', tabId });
      break;
  }

  // Relay all messages to the popup
  try {
    const [popup] = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] });
    if (popup) {
      message.tabId = tabId;
      chrome.runtime.sendMessage(popup.id, message).catch(() => { });
    }
  } catch (e) { }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // Relay messages from pageScript to the popup
  const [popup] = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] });
  if (popup) {
    if (sender.tab) message.tabId = sender.tab.id;
    chrome.runtime.sendMessage(popup.id, message).catch(() => { });
  }
});

function pageScript(extId) {
  try {
    (() => {
      const attachInterval = setInterval(() => {
        try {
          let app = undefined;
          let hasGameState = false;
          try {
            // try vue
            app = document.querySelector('#app').__vue__.$store.state.app;
          } catch (e) { }
          if (!app) {
            try {
              // try nuxt (ltouroumov version)
              app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            } catch (e) { }
          }
          if (!app) {
            // try svelte
            app = window.debugApp;
          }
          if (!app) {
            // try window.game.state.points
            try {
              if (window.game?.state?.points) {
                hasGameState = true;
                app = true; // just marker that we found something
              }
            } catch (e) { }
          }

          if (!app) return;

          clearInterval(attachInterval);
          chrome.runtime.sendMessage(extId, { type: 'activate' });

          setInterval(updateScores, 500);
        } catch (e) { }
      }, 1000);

      setTimeout(() => clearInterval(attachInterval), 5 * 60 * 1000); // stop trying after 5 minutes

      function updateScores() {
        let app = undefined;
        try {
          // try vue
          app = document.querySelector('#app').__vue__.$store.state.app;
        } catch (e) { }
        if (!app) {
          try {
            // try nuxt (ltouroumov version)
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          } catch (e) { }
        }
        if (!app) {
          // try svelte
          app = window.debugApp;
        }

        let points;
        if (app && app.pointTypes) {
          points = app.pointTypes.map((point) => ({
            name: point.name,
            value: point.startingSum
          }));
        } else {
          // try window.game.state.points
          try {
            const gamePoints = window.game?.state?.points;
            if (gamePoints) {
              points = Object.entries(gamePoints).map(([name, value]) => ({
                name: name,
                value: value
              }));
            }
          } catch (e) { }
        }

        if (!points) return;

        chrome.runtime.sendMessage(extId, { type: 'points', points });

        // Also send row information
        let rows;
        if (app && app.rows) {
          function collectRowInfo(row) {
            return {
              name: row.name || row.title || '',
              id: row.id,
              hasObjects: !!(row.objects && row.objects.length)
            };
          }
          rows = Array.from(app.rows).map(collectRowInfo);
        } else {
          // try window.game.data.sections
          try {
            const sections = window.game?.data?.sections;
            if (sections) {
              rows = Array.from(sections).map((section, index) => ({
                name: section.id || '',
                id: index,
                hasObjects: false
              }));
            }
          } catch (e) { }
        }

        if (rows) {
          chrome.runtime.sendMessage(extId, { type: 'rows', rows });
        }
      }
    })();
  } catch (e) { }
}
