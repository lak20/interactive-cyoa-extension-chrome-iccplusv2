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
      message.frameId = sender.frameId;
      chrome.runtime.sendMessage(popup.id, message).catch(() => { });
    }
  } catch (e) { }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // Relay messages from pageScript to the popup
  const [popup] = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] });
  if (popup) {
    if (sender.tab) message.tabId = sender.tab.id;
    message.frameId = sender.frameId;
    chrome.runtime.sendMessage(popup.id, message).catch(() => { });
  }
});

function pageScript(extId) {
  try {
    (() => {
      function unref(val) {
        if (val === null || val === undefined) return val;
        try {
          if (typeof val === 'object' && ('value' in val || '__v_isRef' in val)) {
            return val.value;
          }
        } catch (e) { }
        return val;
      }

      function getOwnKeys(obj) {
        if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return [];
        try {
          const keys = Object.keys(obj);
          const symbols = Object.getOwnPropertySymbols(obj);
          return [...keys, ...symbols];
        } catch (e) {
          return [];
        }
      }

      function scanSubTree(vnode, visited = new Set(), depth = 0, collectedRowsMap = new Map()) {
        if (!vnode || depth > 40 || typeof vnode !== 'object') return;
        if (visited.has(vnode)) return;
        visited.add(vnode);

        try {
          if (vnode.component && vnode.component.subTree) {
            scanSubTree(vnode.component.subTree, visited, depth + 1, collectedRowsMap);
          }

          if (vnode.props) {
            const keys = getOwnKeys(vnode.props);
            for (const k of keys) {
              try {
                const val = unref(vnode.props[k]);
                if (val && typeof val === 'object') {
                  const perks = unref(val.perks || val.objects || val.cards);
                  if (perks && (Array.isArray(perks) || typeof perks === 'object') && (val.title || val.name || val.uid || val.id)) {
                    const uid = val.uid || val.id || val.title || val.name;
                    if (uid && collectedRowsMap && !collectedRowsMap.has(uid)) {
                      collectedRowsMap.set(uid, val);
                    }
                  }
                }
              } catch (e) { }
            }
          }

          const childrenLists = [vnode.children, vnode.dynamicChildren];
          for (const list of childrenLists) {
            if (!list) continue;
            if (Array.isArray(list)) {
              for (const child of list) {
                if (child && typeof child === 'object') {
                  scanSubTree(child, visited, depth + 1, collectedRowsMap);
                }
              }
            } else if (typeof list === 'object') {
              scanSubTree(list, visited, depth + 1, collectedRowsMap);
            }
          }
        } catch (e) { }
      }

      function getAllVueComponents() {
        const components = [];
        const visitedComps = new Set();

        function addComp(comp) {
          if (!comp || visitedComps.has(comp)) return;
          visitedComps.add(comp);
          components.push(comp);

          try { if (comp.parent) addComp(comp.parent); } catch (e) { }
          try { if (comp.root) addComp(comp.root); } catch (e) { }
        }

        try {
          if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps) {
            for (const app of window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps) {
              if (app._instance) addComp(app._instance);
            }
          }
        } catch (e) { }

        try {
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.__vueParentComponent) {
              addComp(el.__vueParentComponent);
            }
            if (el.__vue_app__ && el.__vue_app__._instance) {
              addComp(el.__vue_app__._instance);
            }
            const vnode = el._vnode || el.__vnode;
            if (vnode && vnode.component) {
              addComp(vnode.component);
            }
          }
        } catch (e) { }

        return components;
      }

      function injectDummyPerk(app) {
        if (!app || window.__VUE3_ICC_DUMMY_PERK_INJECTED__) return;

        function doInject() {
          if (window.__VUE3_ICC_DUMMY_PERK_INJECTED__) return;
          try {
            const rawRows = unref(app.rows);
            if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) return;

            const isDragonballs = window.location.href.includes('/dragonballs/');
            if (isDragonballs) {
              const firstRow = unref(rawRows[0]);
              if (firstRow && firstRow.perks) {
                const rawPerks = unref(firstRow.perks);
                const perkList = Array.isArray(rawPerks) ? rawPerks : Object.values(rawPerks);
                const firstPerk = unref(perkList[0]);
                if (firstPerk) {
                  firstPerk.chosen = true;
                  if (!firstPerk.cost || !Array.isArray(firstPerk.cost)) {
                    firstPerk.cost = [];
                  }
                  firstPerk.cost[0] = { name: "Points", value: 0, show: false };
                  firstPerk.cost[1] = { name: "Mutation Points", value: 0, show: false };
                  firstPerk.cost[2] = { name: "Z-Coins", value: 0, show: false };
                  window.__VUE3_ICC_DUMMY_PERK_INJECTED__ = true;
                  return;
                }
              }
            }

            const lastRowIndex = rawRows.length - 1;
            const lastRow = unref(rawRows[lastRowIndex]);
            if (!lastRow) return;

            if (!lastRow.perks) {
              lastRow.perks = [];
            }

            const rawPerks = unref(lastRow.perks);
            const perkList = Array.isArray(rawPerks) ? rawPerks : Object.values(rawPerks);
            const nextPerkIndex = perkList.length;

            const newPerk = {
              title: "Cheat",
              multiple: false,
              showInImage: false,
              description: "cheat",
              chosen: true,
              cost: [
                {
                  name: "Points",
                  value: 0,
                  show: false
                },
                {
                  name: "Mutation Points",
                  value: 0,
                  show: false
                },
                {
                  name: "Z-Coins",
                  value: 0,
                  show: false
                }
              ]
            };

            if (Array.isArray(rawPerks)) {
              rawPerks[nextPerkIndex] = newPerk;
            } else if (typeof rawPerks === 'object') {
              rawPerks[nextPerkIndex] = newPerk;
            }

            window.__VUE3_ICC_DUMMY_PERK_INJECTED__ = true;
          } catch (e) {
            console.error('[CYOA Extension] Failed to inject Cheat perk:', e);
          }
        }

        if (document.readyState === 'complete') {
          doInject();
        } else {
          window.addEventListener('load', doInject, { once: true });
          setTimeout(doInject, 1000);
        }
      }

      function scanDOM() {
        if (window.__VUE3_ICC_APP__ && Array.isArray(unref(window.__VUE3_ICC_APP__.rows)) && unref(window.__VUE3_ICC_APP__.rows).length > 0) {
          injectDummyPerk(window.__VUE3_ICC_APP__);
          return true;
        }

        const collectedRowsMap = new Map();
        const comps = getAllVueComponents();

        for (const comp of comps) {
          if (comp.subTree) {
            scanSubTree(comp.subTree, new Set(), 0, collectedRowsMap);
          }
        }

        if (collectedRowsMap.size > 0) {
          const syntheticStore = {
            rows: Array.from(collectedRowsMap.values())
          };
          window.__VUE3_ICC_APP__ = syntheticStore;
          injectDummyPerk(syntheticStore);
          return true;
        }

        return false;
      }

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
            // try vue 3 custom
            if (scanDOM()) {
              app = window.__VUE3_ICC_APP__;
            }
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
          if (!app) {
            // try window.playerState.metaResources
            try {
              if (window.playerState?.metaResources) {
                hasGameState = true;
                app = true;
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
        let vue3App = undefined;
        try {
          vue3App = window.__VUE3_ICC_APP__;
        } catch (e) { }

        if (vue3App && vue3App.rows && vue3App.rows.length > 0) {
          try {
            const rows = vue3App.rows;
            const isDragonballs = window.location.href.includes('/dragonballs/');
            const targetRow = isDragonballs ? rows[0] : rows[rows.length - 1];
            if (targetRow && targetRow.perks && targetRow.perks.length > 0) {
              const perks = targetRow.perks;
              const targetPerk = isDragonballs ? perks[0] : perks[perks.length - 1];
              if (targetPerk && targetPerk.cost) {
                const costArr = targetPerk.cost;
                const len = costArr.length || 0;
                const pts = [];
                for (let i = 0; i < len; i++) {
                  const item = costArr[i];
                  if (item) {
                    pts.push({
                      name: String(item.name || ''),
                      value: item.value !== undefined ? -Number(item.value) : 0
                    });
                  }
                }
                if (pts.length > 0) points = pts;
              }
            }
          } catch (e) { }
        }

        if (!points && app && app.pointTypes) {
          points = app.pointTypes.map((point) => ({
            name: point.name,
            value: point.startingSum
          }));
        } else if (!points) {
          // try window.game.state.points
          try {
            const gamePoints = window.game?.state?.points;
            if (gamePoints) {
              points = Object.entries(gamePoints).map(([name, value]) => ({
                name: name,
                value: value
              }));
            } else {
              const playerPoints = window.playerState?.metaResources;
              if (playerPoints) {
                points = Object.entries(playerPoints).map(([name, value]) => ({
                  name: name,
                  value: value
                }));
              }
            }
          } catch (e) { }
        }

        if (!points) return;

        chrome.runtime.sendMessage(extId, { type: 'points', points });

        // Also send row information
        let rows;
        if (app && app.rows) {
          function collectRowInfo(row) {
            const perks = row.perks || row.objects || row.cards;
            return {
              name: row.title || row.name || row.uid || row.id || '',
              id: row.uid || row.id,
              hasObjects: !!(perks && (Array.isArray(perks) ? perks.length : Object.keys(perks).length)),
              allowedChoices: row.maxChosen !== undefined ? row.maxChosen : (row.allowedChoices !== undefined ? row.allowedChoices : (row.maxSelections !== undefined ? row.maxSelections : 0))
            };
          }
          rows = Array.from(app.rows).map(collectRowInfo);
        } else if (vue3App && vue3App.rows) {
          function collectRowInfo(row) {
            const perks = row.perks || row.objects || row.cards;
            return {
              name: row.title || row.name || row.uid || row.id || '',
              id: row.uid || row.id,
              hasObjects: !!(perks && (Array.isArray(perks) ? perks.length : Object.keys(perks).length)),
              allowedChoices: row.maxChosen !== undefined ? row.maxChosen : (row.allowedChoices !== undefined ? row.allowedChoices : (row.maxSelections !== undefined ? row.maxSelections : 0))
            };
          }
          rows = Array.from(vue3App.rows).map(collectRowInfo);
        } else {
          // try window.game.data.sections
          try {
            const sections = window.game?.data?.sections;
            if (sections) {
              rows = Array.from(sections).map((section, index) => ({
                name: section.id || '',
                id: index,
                hasObjects: false,
                maxSelections: section.maxSelections !== undefined ? section.maxSelections : 0
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
