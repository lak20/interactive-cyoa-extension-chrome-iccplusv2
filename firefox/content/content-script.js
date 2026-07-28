try {
  (() => {
    // Frame-safe injection of main-world scanner script
    function injectMainWorld() {
      try {
        const target = document.head || document.documentElement || document.body;
        if (target) {
          const script = document.createElement('script');
          script.src = browser.runtime.getURL('content/inject-main-world.js');
          target.appendChild(script);
          script.remove();
        } else {
          document.addEventListener('DOMContentLoaded', injectMainWorld, { once: true });
        }
      } catch (e) { }
    }
    injectMainWorld();

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.source === 'CYOA_MAIN_WORLD' && event.data.type === 'CYOA_VUE3_STATE') {
        try {
          browser.runtime.sendMessage({ type: 'activate' });
        } catch (e) { }
        if (event.data.points && event.data.points.length > 0) {
          try {
            browser.runtime.sendMessage({ type: 'points', points: event.data.points });
          } catch (e) { }
        }
        if (event.data.rows && event.data.rows.length > 0) {
          try {
            browser.runtime.sendMessage({ type: 'rows', rows: event.data.rows });
          } catch (e) { }
        }
      }
    });

    const attachInterval = setInterval(() => {
      try {
        let app = undefined;
        try {
          // try vue
          app = document.querySelector('#app').wrappedJSObject.__vue__.$store.state.app;
        } catch (e) { }
        if (!app) {
          try {
            app = document.querySelector('#app').__vue__.$store.state.app;
          } catch (e) { }
        }
        if (!app) {
          // try nuxt + pinia (ltouroumov version)
          try {
            // Try with wrappedJSObject first
            app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          } catch (e) {
            try {
              // Fallback to without wrappedJSObject
              app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            } catch (e) { }
          }
        }
        if (!app) {
          // try svelte
          try {
            app = window.wrappedJSObject.debugApp;
          } catch (e) { }
          if (!app) {
            app = window.debugApp;
          }
        }
        if (!app) {
          // try vue 3 custom
          try {
            app = window.wrappedJSObject.__VUE3_ICC_APP__;
          } catch (e) { }
          if (!app) {
            app = window.__VUE3_ICC_APP__;
          }
        }
        if (!app) {
          // try window.game.state.points
          try {
            app = window.wrappedJSObject.game?.state?.points || window.game?.state?.points;
          } catch (e) { }
        }
        if (!app) {
          // try window.playerState.metaResources
          try {
            app = window.wrappedJSObject.playerState?.metaResources || window.playerState?.metaResources;
          } catch (e) { }
        }
        if (!app) return;

        clearInterval(attachInterval);
        browser.runtime.sendMessage({ type: 'activate' });

        setInterval(updateScores, 500);
      } catch (e) { }
    }, 1000);

    setTimeout(() => clearInterval(attachInterval), 5 * 60 * 1000); // stop trying after 5 minutes

    function updateScores() {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').wrappedJSObject.__vue__.$store.state.app;
      } catch (e) { }
      if (!app) {
        try {
          app = document.querySelector('#app').__vue__.$store.state.app;
        } catch (e) { }
      }
      if (!app) {
        // try nuxt + pinia (ltouroumov version)
        try {
          // Try with wrappedJSObject first
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
        } catch (e) {
          try {
            // Fallback to without wrappedJSObject
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          } catch (e) { }
        }
      }
      if (!app) {
        // try svelte
        try {
          app = window.wrappedJSObject.debugApp;
        } catch (e) { }
        if (!app) {
          app = window.debugApp;
        }
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.wrappedJSObject.__VUE3_ICC_APP__;
        } catch (e) { }
        if (!app) {
          app = window.__VUE3_ICC_APP__;
        }
      }

      let points;
      let vue3App = undefined;
      try {
        vue3App = window.wrappedJSObject.__VUE3_ICC_APP__ || window.__VUE3_ICC_APP__;
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
                if (item && item.name && String(item.name).trim() !== '' && String(item.name) !== 'undefined') {
                  pts.push({
                    name: String(item.name),
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
        const legacyPts = Array.prototype.map.call(app.pointTypes, (point) => ({
          name: point ? point.name : undefined,
          value: point ? point.startingSum : 0
        })).filter((p) => p && p.name && p.name !== 'undefined');
        if (legacyPts.length > 0) points = legacyPts;
      } else if (!points) {
        // try window.game.state.points
        try {
          const gamePoints = window.wrappedJSObject.game?.state?.points || window.game?.state?.points;
          if (gamePoints) {
            points = Object.entries(gamePoints).map(([name, value]) => ({
              name: name,
              value: value
            }));
          } else {
            const playerPoints = window.wrappedJSObject.playerState?.metaResources || window.playerState?.metaResources;
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

      browser.runtime.sendMessage({ type: 'points', points }).catch(() => { });
    }
  })();
} catch (e) { }
