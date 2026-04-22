try {
  (() => {
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

      let points;
      if (app && app.pointTypes) {
        points = Array.prototype.map.call(app.pointTypes, (point) => ({
          name: point.name,
          value: point.startingSum
        }));
      } else {
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
