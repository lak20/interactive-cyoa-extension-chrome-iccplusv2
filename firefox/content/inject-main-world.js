(function () {
  if (window.__VUE3_ICC_INJECTED__) return;
  window.__VUE3_ICC_INJECTED__ = true;

  console.log('[CYOA Extension] Vue 3 main-world VNode scanner initialized.');

  /**
   * Safely unwraps Vue 3 RefImpl objects or returns the value directly.
   */
  function unref(val) {
    if (val === null || val === undefined) return val;
    try {
      if (typeof val === 'object' && ('value' in val || '__v_isRef' in val)) {
        return val.value;
      }
    } catch (e) { }
    return val;
  }

  /**
   * Safely retrieves all string keys and Symbol properties on an object.
   */
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

  /**
   * Recursively walks VNode trees (subTrees, children, dynamicChildren, props)
   * to harvest row objects passed as props to components.
   */
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

  /**
   * Discovers active Vue 3 component instances via DevTools hook & DOM element properties.
   */
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

  /**
   * Injects Cheat perk with "cheat" description and cost items initialized to 0 once site loads.
   */
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
              firstPerk.cost[3] = { name: "Embers", value: 0, show: false };
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
            },
            {
              name: "Embers",
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

  /**
   * Scans VNode component tree and populates window.__VUE3_ICC_APP__.
   */
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

  // User Diagnostic helper for Web Console
  window.__debugCYOA = function () {
    console.group('[CYOA Extension Vue 3 Diagnostics]');
    console.log('window.__VUE3_ICC_APP__:', window.__VUE3_ICC_APP__);

    const comps = getAllVueComponents();
    console.log(`Found ${comps.length} Vue 3 component instances in DOM.`);

    comps.forEach((comp, idx) => {
      const name = comp.type?.name || comp.type?.__name || 'Anonymous';
      console.group(`Component #${idx + 1}: ${name}`);
      console.log('Instance:', comp);
      console.log('comp.subTree:', comp.subTree);
      console.groupEnd();
    });

    console.groupEnd();
    return 'Diagnostics complete.';
  };

  // Periodic scanner
  const pollInterval = setInterval(() => {
    if (scanDOM()) {
      clearInterval(pollInterval);
    }
  }, 500);
  setTimeout(() => clearInterval(pollInterval), 60000);

  /**
   * Periodically posts state messages to content script for mobile & desktop compatibility.
   */
  function syncStateToContentScript() {
    if (!window.__VUE3_ICC_APP__ || !window.__VUE3_ICC_APP__.rows) return;
    try {
      const rawRows = unref(window.__VUE3_ICC_APP__.rows);
      if (!Array.isArray(rawRows) || rawRows.length === 0) return;

      const isDb = window.location.href.includes('/dragonballs/');
      const targetRow = isDb ? unref(rawRows[0]) : unref(rawRows[rawRows.length - 1]);
      let points = [];

      if (targetRow && targetRow.perks) {
        const rawPerks = unref(targetRow.perks);
        const perkList = Array.isArray(rawPerks) ? rawPerks : Object.values(rawPerks);
        const targetPerk = isDb ? unref(perkList[0]) : unref(perkList[perkList.length - 1]);
        if (targetPerk && targetPerk.cost) {
          const costArr = unref(targetPerk.cost);
          if (Array.isArray(costArr)) {
            for (let i = 0; i < costArr.length; i++) {
              const item = unref(costArr[i]);
              if (item) {
                points.push({
                  name: String(item.name || ''),
                  value: item.value !== undefined ? -Number(item.value) : 0
                });
              }
            }
          }
        }
      }

      const rowInfos = rawRows.map((rowObj) => {
        const row = unref(rowObj);
        const perks = unref(row.perks || row.objects || row.cards);
        return {
          name: row.title || row.name || row.uid || row.id || '',
          id: row.uid || row.id,
          hasObjects: !!(perks && (Array.isArray(perks) ? perks.length : Object.keys(perks).length)),
          allowedChoices: row.maxChosen !== undefined ? row.maxChosen : (row.allowedChoices !== undefined ? row.allowedChoices : (row.maxSelections !== undefined ? row.maxSelections : 0))
        };
      });

      window.postMessage({
        source: 'CYOA_MAIN_WORLD',
        type: 'CYOA_VUE3_STATE',
        points: points,
        rows: rowInfos
      }, '*');
    } catch (e) { }
  }

  setInterval(syncStateToContentScript, 500);

  // DOM MutationObserver fallback
  const observer = new MutationObserver(() => {
    if (scanDOM()) {
      observer.disconnect();
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Hook Vue DevTools init if present
  function attachDevToolsHook() {
    const existingHook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
    if (existingHook) {
      const origEmit = existingHook.emit;
      existingHook.emit = function (event, ...args) {
        if (event === 'app:init') {
          setTimeout(scanDOM, 100);
        }
        if (origEmit) origEmit.apply(this, [event, ...args]);
      };
    }
  }
  attachDevToolsHook();

  // Immediate scan execution
  scanDOM();
})();
