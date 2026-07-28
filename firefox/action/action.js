const pointsContainer = document.getElementById('points-container');
const actionsContainer = document.getElementById('actions-container');

// Scroll to middle when the container is shown
function scrollToMiddle() {
  setTimeout(() => {
    const scrollWidth = actionsContainer.scrollWidth;
    const clientWidth = actionsContainer.clientWidth;
    if (scrollWidth > clientWidth) {
      actionsContainer.scrollLeft = (scrollWidth - clientWidth) / 2;
    }
  }, 0);
}

const addPointContainer = document.getElementById('add-point-container');
const customPointNameInput = document.getElementById('custom-point-name-input');
const addCustomPointBtn = document.getElementById('add-custom-point-button');

function checkVue3EngineAndShowAddPoint() {
  getCurrentTab().then((tab) => {
    if (tab && tab.id) {
      browser.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => !!(window.wrappedJSObject.__VUE3_ICC_APP__ || window.__VUE3_ICC_APP__)
      }).then((results) => {
        if (results && results.some((r) => r.result)) {
          if (addPointContainer) addPointContainer.style.display = 'flex';
        }
      }).catch(() => { });
    }
  });
}
checkVue3EngineAndShowAddPoint();

function triggerAddCustomPoint(frameId) {
  if (!customPointNameInput) return;
  const name = customPointNameInput.value.trim();
  if (!name) return;

  getCurrentTab().then((tab) => {
    const target = { tabId: tab.id };
    if (frameId !== undefined) target.frameIds = [frameId];
    else target.allFrames = true;

    browser.scripting.executeScript({
      target: target,
      func: addCustomPointType,
      args: [name]
    }).then(() => {
      customPointNameInput.value = '';
    }).catch(() => { });
  });
}

if (addCustomPointBtn) {
  addCustomPointBtn.onclick = () => triggerAddCustomPoint();
}
if (customPointNameInput) {
  customPointNameInput.onkeydown = (e) => {
    if (e.key === 'Enter') triggerAddCustomPoint();
  };
}

// Request rows immediately when popup opens
getCurrentTab().then((tab) => {
  if (tab && tab.id) {
    browser.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: getRowsInfo
    });
  }
}).catch(() => { });

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  const tab = await getCurrentTab();

  if (!tab || !sender.tab || sender.tab.id === tab.id) {
    if (actionsContainer.style.display !== 'flex') {
      actionsContainer.style.display = 'flex';
      //scrollToMiddle();
    }
    switch (message.type) {
      case 'points':
        updatePoints(message.points, sender.frameId);
        // After receiving points, request rows info
        getCurrentTab().then((tab) => {
          browser.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [sender.frameId] },
            func: getRowsInfo
          });
        });
        break;
      case 'rows':
        updateRowControls(message.rows, sender.frameId);
        break;
    }
  }
});

function getRowsInfo() {
  try {
    (() => {
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
      let isNuxt = false;
      if (!app) {
        // try nuxt + pinia (ltouroumov version)
        try {
          // Try with wrappedJSObject first
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) {
          try {
            // Fallback to without wrappedJSObject
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            isNuxt = true;
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

      let rows;
      if (app && app.rows) {
        function collectRowInfo(row) {
          return {
            name: row.name || row.title || '',
            id: row.id,
            hasObjects: !!((row.perks && row.perks.length) || (row.objects && row.objects.length) || (row.cards && row.cards.length)),
            allowedChoices: row.maxChosen !== undefined ? row.maxChosen : (row.allowedChoices !== undefined ? row.allowedChoices : (row.maxSelections !== undefined ? row.maxSelections : 0))
          };
        }
        rows = Array.from(app.rows).map(collectRowInfo);
      } else {
        // try window.game.data.sections
        try {
          const sections = window.wrappedJSObject.game?.data?.sections || window.game?.data?.sections;
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
        browser.runtime.sendMessage({ type: 'rows', rows });
      }
    })();
  } catch (e) { }
}

function createRowActionButtons(row, index, frameId) {
  const container = document.createElement('div');
  container.className = 'row-actions';

  // Editable row limit input
  const rowLimitInput = document.createElement('input');
  rowLimitInput.type = 'number';
  rowLimitInput.className = 'row-limit-input';
  rowLimitInput.title = 'Row Limit';
  rowLimitInput.value = row.maxChosen !== undefined ? row.maxChosen : (row.allowedChoices !== undefined ? row.allowedChoices : (row.maxSelections !== undefined ? row.maxSelections : 0));
  rowLimitInput.onchange = () => {
    const newLimit = parseInt(rowLimitInput.value, 10) || 0;
    getCurrentTab().then((tab) => {
      browser.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId] },
        func: setRowLimit,
        args: [index, newLimit]
      });
    });
  };

  const rowNameElem = document.createElement('div');
  rowNameElem.className = 'row-name';
  rowNameElem.textContent = row.name || `Row ${index + 1}`;

  // Create left container
  const leftContainer = document.createElement('div');
  leftContainer.className = 'row-button-container';

  // Create right container
  const rightContainer = document.createElement('div');
  rightContainer.className = 'row-button-container';

  const removeRowLimitsBtn = document.createElement('button');
  removeRowLimitsBtn.textContent = 'Remove Row Limit';
  removeRowLimitsBtn.onclick = () => {
    getCurrentTab().then((tab) => {
      browser.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId] },
        func: removeRowLimits,
        args: [index]
      });
    });
  };

  const removeRequirementsBtn = document.createElement('button');
  removeRequirementsBtn.textContent = 'Remove Requirements';
  removeRequirementsBtn.onclick = () => {
    getCurrentTab().then((tab) => {
      browser.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId] },
        func: removeRequirements,
        args: [index]
      });
    });
  };

  const removeRandomnessBtn = document.createElement('button');
  removeRandomnessBtn.textContent = 'Remove Randomness';
  removeRandomnessBtn.onclick = () => {
    getCurrentTab().then((tab) => {
      browser.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId] },
        func: removeRandomness,
        args: [index]
      });
    });
  };

  const toggleRequirementsBtn = document.createElement('button');
  toggleRequirementsBtn.textContent = 'Toggle Requirements';
  toggleRequirementsBtn.onclick = () => {
    getCurrentTab().then((tab) => {
      browser.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId] },
        func: toggleAllRequirements,
        args: [index]
      });
    });
  };

  // Add buttons to left container
  leftContainer.appendChild(removeRowLimitsBtn);
  leftContainer.appendChild(removeRequirementsBtn);

  // Add buttons to right container
  rightContainer.appendChild(removeRandomnessBtn);
  rightContainer.appendChild(toggleRequirementsBtn);

  // Add all elements to main container
  container.appendChild(rowLimitInput);
  container.appendChild(rowNameElem);
  container.appendChild(leftContainer);
  container.appendChild(rightContainer);
  return container;
}

function updateRowControls(rows, frameId) {
  const rowActionsContainer = document.getElementById('row-actions-container');

  // If rows already exist with the same count, just update values in-place
  const existingRows = rowActionsContainer.querySelectorAll('.row-actions');
  if (existingRows.length === rows.length && rows.length > 0) {
    rows.forEach((row, index) => {
      const input = existingRows[index].querySelector('.row-limit-input');
      if (input && input !== document.activeElement) {
        const newValue = row.maxChosen !== undefined ? row.maxChosen : (row.allowedChoices !== undefined ? row.allowedChoices : (row.maxSelections !== undefined ? row.maxSelections : 0));
        input.value = newValue;
      }
    });
    return;
  }

  rowActionsContainer.innerHTML = ''; // Clear existing buttons

  if (rows.length === 0) {
    const noRowsMsg = document.createElement('div');
    noRowsMsg.className = 'no-rows-message';
    noRowsMsg.textContent = 'No rows found';
    rowActionsContainer.appendChild(noRowsMsg);
    return;
  }

  rows.forEach((row, index) => {
    const rowButtons = createRowActionButtons(row, index, frameId);
    rowActionsContainer.appendChild(rowButtons);
  });
}

function updatePoints(points, frameId = 0) {
  for (let i = 0; i < points.length; i++) {
    const point = points[i];

    let child;
    if (i < pointsContainer.childNodes.length) {
      child = pointsContainer.childNodes[i];
    } else {
      child = document.createElement('div');
      child.className = 'point';
      const nameElem = document.createElement('div');
      nameElem.className = 'name';
      const valueElem = document.createElement('input');
      valueElem.className = 'value';
      const index = i;
      valueElem.onchange = () => {
        try {
          const value = parseFloat(valueElem.value);
          getCurrentTab().then((tab) => {
            browser.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [frameId] },
              func: updatePoint,
              args: [index, value]
            });
          });
        } catch (e) { }
      };

      // Create button container
      const rightbuttonContainer = document.createElement('div');
      rightbuttonContainer.className = 'point-button-container';

      // Add +5 button
      const add5Btn = document.createElement('button');
      add5Btn.textContent = '+5';
      add5Btn.onclick = () => {
        const currentValue = parseFloat(valueElem.value) || 0;
        const newValue = currentValue + 5;
        valueElem.value = newValue;
        try {
          getCurrentTab().then((tab) => {
            browser.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [frameId] },
              func: updatePoint,
              args: [index, newValue]
            });
          });
        } catch (e) { }
      };

      // Add +10 button
      const add10Btn = document.createElement('button');
      add10Btn.textContent = '+10';
      add10Btn.onclick = () => {
        const currentValue = parseFloat(valueElem.value) || 0;
        const newValue = currentValue + 10;
        valueElem.value = newValue;
        try {
          getCurrentTab().then((tab) => {
            browser.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [frameId] },
              func: updatePoint,
              args: [index, newValue]
            });
          });
        } catch (e) { }
      };

      // Add 2x button
      const mul2Btn = document.createElement('button');
      mul2Btn.textContent = '2x';
      mul2Btn.onclick = () => {
        const currentValue = parseFloat(valueElem.value) || 0;
        const newValue = currentValue * 2;
        valueElem.value = newValue;
        try {
          getCurrentTab().then((tab) => {
            browser.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [frameId] },
              func: updatePoint,
              args: [index, newValue]
            });
          });
        } catch (e) { }
      };

      rightbuttonContainer.appendChild(add5Btn);
      rightbuttonContainer.appendChild(add10Btn);
      rightbuttonContainer.appendChild(mul2Btn);

      // Create left button container
      const leftButtonContainer = document.createElement('div');
      leftButtonContainer.className = 'point-button-container left';

      // Add /2 button
      const div2Btn = document.createElement('button');
      div2Btn.textContent = '/2';
      div2Btn.onclick = () => {
        const currentValue = parseFloat(valueElem.value) || 0;
        const newValue = currentValue / 2;
        valueElem.value = newValue;
        try {
          getCurrentTab().then((tab) => {
            browser.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [frameId] },
              func: updatePoint,
              args: [index, newValue]
            });
          });
        } catch (e) { }
      };

      // Add -10 button
      const sub10Btn = document.createElement('button');
      sub10Btn.textContent = '-10';
      sub10Btn.onclick = () => {
        const currentValue = parseFloat(valueElem.value) || 0;
        const newValue = currentValue - 10;
        valueElem.value = newValue;
        try {
          getCurrentTab().then((tab) => {
            browser.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [frameId] },
              func: updatePoint,
              args: [index, newValue]
            });
          });
        } catch (e) { }
      };

      // Add -5 button
      const sub5Btn = document.createElement('button');
      sub5Btn.textContent = '-5';
      sub5Btn.onclick = () => {
        const currentValue = parseFloat(valueElem.value) || 0;
        const newValue = currentValue - 5;
        valueElem.value = newValue;
        try {
          getCurrentTab().then((tab) => {
            browser.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [frameId] },
              func: updatePoint,
              args: [index, newValue]
            });
          });
        } catch (e) { }
      };

      leftButtonContainer.appendChild(div2Btn);
      leftButtonContainer.appendChild(sub10Btn);
      leftButtonContainer.appendChild(sub5Btn);

      child.appendChild(nameElem);
      child.appendChild(leftButtonContainer);
      child.appendChild(valueElem);
      child.appendChild(rightbuttonContainer);
      pointsContainer.appendChild(child);
    }

    const nameElem = child.querySelector('.name');
    const valueElem = child.querySelector('.value');
    if (nameElem.innerText !== point.name) {
      nameElem.innerText = point.name;
    }
    if (valueElem.value !== point.value && valueElem !== document.activeElement) {
      valueElem.value = point.value;
    }
  }

  for (let i = pointsContainer.childNodes.length - 1; i >= points.length; i--) {
    pointsContainer.removeChild(pointsContainer.childNodes[i]);
  }
}

function updatePoint(index, value) {
  try {
    (() => {
      let vue3App = undefined;
      try {
        vue3App = window.wrappedJSObject.__VUE3_ICC_APP__ || window.__VUE3_ICC_APP__;
      } catch (e) { }

      if (vue3App || window.__VUE3_ICC_APP__) {
        try {
          const script = document.createElement('script');
          script.textContent = `try {
            const app = window.__VUE3_ICC_APP__;
            if (app && app.rows && app.rows.length) {
              const isDb = window.location.href.includes('/dragonballs/');
              const targetRow = isDb ? app.rows[0] : app.rows[app.rows.length - 1];
              if (targetRow && targetRow.perks && targetRow.perks.length) {
                const targetPerk = isDb ? targetRow.perks[0] : targetRow.perks[targetRow.perks.length - 1];
                if (targetPerk) {
                  if (!targetPerk.cost || !Array.isArray(targetPerk.cost)) targetPerk.cost = [];
                  if (targetPerk.cost[${index}]) {
                    targetPerk.cost[${index}].value = -(${value});
                  }
                }
              }
            }
          } catch (e) {}`;
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (e) { }
        return;
      }

      let app = undefined;
      let pointName = undefined;
      try {
        // try vue
        app = document.querySelector('#app').wrappedJSObject.__vue__.$store.state.app;
      } catch (e) { }
      if (!app) {
        try {
          app = document.querySelector('#app').__vue__.$store.state.app;
        } catch (e) { }
      }
      let isNuxt = false;
      if (!app) {
        // try nuxt + pinia (ltouroumov version)
        try {
          // Try with wrappedJSObject first
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) {
          try {
            // Fallback to without wrappedJSObject
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            isNuxt = true;
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
        // try window.game.state.points or window.playerState.metaResources
        try {
          let pointTypes = undefined;
          let isGamePoints = false;
          let isPlayerPoints = false;

          if (window.wrappedJSObject.game?.state?.points || window.game?.state?.points) {
            pointTypes = window.wrappedJSObject.game?.state?.points ? Object.keys(window.wrappedJSObject.game.state.points) : Object.keys(window.game.state.points);
            isGamePoints = true;
          } else if (window.wrappedJSObject.playerState?.metaResources || window.playerState?.metaResources) {
            pointTypes = window.wrappedJSObject.playerState?.metaResources ? Object.keys(window.wrappedJSObject.playerState.metaResources) : Object.keys(window.playerState.metaResources);
            isPlayerPoints = true;
          }

          if (pointTypes) {
            pointName = pointTypes[index];
            if (pointName) {
              if (isGamePoints) {
                try {
                  window.wrappedJSObject.game.state.points[pointName] = value;
                } catch (e) {
                  window.game.state.points[pointName] = value;
                }
                try {
                  window.wrappedJSObject.game.updateAfterToggle?.();
                } catch (e) {
                  window.game.updateAfterToggle?.();
                }
              } else if (isPlayerPoints) {
                try {
                  window.wrappedJSObject.playerState.metaResources[pointName] = value;
                } catch (e) {
                  window.playerState.metaResources[pointName] = value;
                }
              }
              return;
            }
          }
        } catch (e) { }
      }

      if (app) {
        app.pointTypes[index].startingSum = value;
      }
      if (isNuxt) {
        try {
          const script = document.createElement('script');
          script.textContent = 'try { const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project"); if (s && s.store && s.store.file && s.store.file.data) { const raw = s.store; const d = raw.file.data; const newData = Object.assign({}, d, { rows: (d.rows || []).slice(), pointTypes: (d.pointTypes || []).slice() }); const newFile = Object.assign({}, raw.file, { data: newData }); s.store = Object.assign({}, raw, { file: newFile }); } } catch (e) {}';
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (e) { }
      }
    })()
  } catch (e) { }
}

function addCustomPointType(pointName) {
  try {
    let vue3App = undefined;
    try {
      vue3App = window.wrappedJSObject.__VUE3_ICC_APP__ || window.__VUE3_ICC_APP__;
    } catch (e) { }

    if (vue3App && vue3App.rows && vue3App.rows.length > 0) {
      try {
        const rows = vue3App.rows;
        const isDb = window.location.href.includes('/dragonballs/');
        const targetRow = isDb ? rows[0] : rows[rows.length - 1];
        if (targetRow && targetRow.perks && targetRow.perks.length > 0) {
          const perks = targetRow.perks;
          const targetPerk = isDb ? perks[0] : perks[perks.length - 1];
          if (targetPerk) {
            if (!targetPerk.cost || !Array.isArray(targetPerk.cost)) {
              targetPerk.cost = [];
            }
            const exists = targetPerk.cost.some((c) => c && c.name && c.name.toLowerCase() === pointName.toLowerCase());
            if (!exists) {
              targetPerk.cost.push({ name: pointName, value: 0, show: false });
            }
            return;
          }
        }
      } catch (e) { }

      try {
        const script = document.createElement('script');
        script.textContent = `try { const app = window.__VUE3_ICC_APP__; if (app && app.rows && app.rows.length) { const isDb = window.location.href.includes('/dragonballs/'); const targetRow = isDb ? app.rows[0] : app.rows[app.rows.length - 1]; if (targetRow && targetRow.perks && targetRow.perks.length) { const targetPerk = isDb ? targetRow.perks[0] : targetRow.perks[targetRow.perks.length - 1]; if (targetPerk) { if (!targetPerk.cost || !Array.isArray(targetPerk.cost)) targetPerk.cost = []; const exists = targetPerk.cost.some(c => c && c.name && c.name.toLowerCase() === "${pointName.replace(/"/g, '\\"').toLowerCase()}"); if (!exists) { targetPerk.cost.push({ name: "${pointName.replace(/"/g, '\\"')}", value: 0, show: false }); } } } } } catch (e) {}`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        return;
      } catch (e) { }
    }
  } catch (e) { }
}

document.getElementById('remove-row-limits-button').onclick = async () => {
  try {
    await browser.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: removeRowLimits
    });
  } catch (e) { }
};

function removeRowLimits(rowIndex = null) {
  try {
    (() => {
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
      let isNuxt = false;
      if (!app) {
        // try nuxt + pinia (ltouroumov version)
        try {
          // Try with wrappedJSObject first
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) {
          try {
            // Fallback to without wrappedJSObject
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            isNuxt = true;
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

      if (app && app.rows) {
        function allThings(func) {
          if (rowIndex !== null) {
            // Handle single row
            if (app.rows[rowIndex]) {
              allObjects(app.rows[rowIndex], func);
            }
          } else {
            // Handle all rows
            Array.prototype.forEach.call(app.rows, (row) => allObjects(row, func));
          }
        }

        function allObjects(row, func) {
          func(row);
          const items = row.perks || row.objects || row.cards;
          if (items && items.length) {
            Array.prototype.forEach.call(items, (child) => allObjects(child, func));
          }
        }

        allThings((obj) => {
          obj.maxChosen = 0;
          obj.allowedChoices = 0;
        });
      } else {
        // try window.game.data.sections
        try {
          const sections = window.wrappedJSObject.game?.data?.sections || window.game?.data?.sections;
          if (sections) {
            if (rowIndex !== null) {
              // Handle single section
              if (sections[rowIndex]) {
                delete sections[rowIndex].maxSelections;
              }
            } else {
              // Handle all sections
              Array.prototype.forEach.call(sections, (section) => {
                delete section.maxSelections;
              });
            }
            try {
              window.wrappedJSObject.game.updateAfterToggle?.();
            } catch (e) {
              window.game.updateAfterToggle?.();
            }
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const script = document.createElement('script');
          script.textContent = 'try { const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project"); if (s && s.store && s.store.file && s.store.file.data) { const raw = s.store; const d = raw.file.data; const newData = Object.assign({}, d, { rows: (d.rows || []).slice(), pointTypes: (d.pointTypes || []).slice() }); const newFile = Object.assign({}, raw.file, { data: newData }); s.store = Object.assign({}, raw, { file: newFile }); } } catch (e) {}';
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

function setRowLimit(rowIndex, value) {
  try {
    (() => {
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
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
        } catch (e) {
          try {
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

      if (app && app.rows) {
        if (app.rows[rowIndex]) {
          const r = app.rows[rowIndex];
          r.maxChosen = value;
          r.allowedChoices = value;
        }
      } else {
        // try window.game.data.sections
        try {
          const sections = window.wrappedJSObject.game?.data?.sections || window.game?.data?.sections;
          if (sections && sections[rowIndex]) {
            sections[rowIndex].maxSelections = value;
            try {
              window.wrappedJSObject.game.updateAfterToggle?.();
            } catch (e) {
              window.game.updateAfterToggle?.();
            }
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const script = document.createElement('script');
          script.textContent = 'try { const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project"); if (s && s.store && s.store.file && s.store.file.data) { const raw = s.store; const d = raw.file.data; const newData = Object.assign({}, d, { rows: (d.rows || []).slice(), pointTypes: (d.pointTypes || []).slice() }); const newFile = Object.assign({}, raw.file, { data: newData }); s.store = Object.assign({}, raw, { file: newFile }); } } catch (e) {}';
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

document.getElementById('remove-randomness-button').onclick = async () => {
  try {
    await browser.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: removeRandomness
    });
  } catch (e) { }
};

function removeRandomness(rowIndex = null) {
  try {
    (() => {
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
      let isNuxt = false;
      if (!app) {
        // try nuxt + pinia (ltouroumov version)
        try {
          // Try with wrappedJSObject first
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) {
          try {
            // Fallback to without wrappedJSObject
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            isNuxt = true;
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

      function allThings(func) {
        if (rowIndex !== null) {
          // Handle single row
          if (app.rows[rowIndex]) {
            allObjects(app.rows[rowIndex], func);
          }
        } else {
          // Handle all rows
          Array.prototype.forEach.call(app.rows, (row) => allObjects(row, func));
        }
      }

      function allObjects(row, func) {
        func(row);
        if (row.objects && row.objects.length) {
          Array.prototype.forEach.call(row.objects, (row) => allObjects(row, func));
        }
      }
      allThings((obj) => obj.isInfoRow && (obj.isInfoRow = false));
      if (isNuxt) {
        try {
          const script = document.createElement('script');
          script.textContent = 'try { const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project"); if (s && s.store && s.store.file && s.store.file.data) { const raw = s.store; const d = raw.file.data; const newData = Object.assign({}, d, { rows: (d.rows || []).slice(), pointTypes: (d.pointTypes || []).slice() }); const newFile = Object.assign({}, raw.file, { data: newData }); s.store = Object.assign({}, raw, { file: newFile }); } } catch (e) {}';
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

document.getElementById('remove-requirements-button').onclick = async () => {
  try {
    await browser.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: removeRequirements
    });
  } catch (e) { }
};

document.getElementById('toggle-requirements-button').onclick = async () => {
  try {
    await browser.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: toggleAllRequirements
    });
  } catch (e) { }
};

document.getElementById('show-requirements-button').onclick = async () => {
  try {
    await browser.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: showAllRequirements
    });
  } catch (e) { }
};

function toggleAllRequirements(rowIndex = null) {
  try {
    (() => {
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
      let isNuxt = false;
      if (!app) {
        // try nuxt + pinia (ltouroumov version)
        try {
          // Try with wrappedJSObject first
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) {
          try {
            // Fallback to without wrappedJSObject
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            isNuxt = true;
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

      if (app && app.rows) {
        function allThings(func) {
          if (rowIndex !== null) {
            // Handle single row
            if (app.rows[rowIndex]) {
              allObjects(app.rows[rowIndex], func);
            }
          } else {
            // Handle all rows
            Array.prototype.forEach.call(app.rows, (row) => allObjects(row, func));
          }
        }

        function allObjects(row, func) {
          func(row);
          const items = row.perks || row.objects || row.cards;
          if (items && items.length) {
            Array.prototype.forEach.call(items, (child) => allObjects(child, func));
          }
        }

        function getRequirementItems(obj) {
          const req = obj.requirement || obj.requireds || obj.requirements;
          if (!req) return [];
          const items = [];
          if (Array.isArray(req)) {
            items.push(...req);
          } else if (typeof req === 'object') {
            if (Array.isArray(req.and)) items.push(...req.and);
            if (Array.isArray(req.or)) items.push(...req.or);
            if (!req.and && !req.or) items.push(req);
          }
          return items;
        }

        allThings((obj) => {
          const reqItems = getRequirementItems(obj);
          reqItems.forEach((req) => {
            if (req.showRequired !== undefined) {
              req.showRequired = !req.showRequired;
            }
            if (req.flags && typeof req.flags === 'object') {
              req.flags.hidden = !req.flags.hidden;
            }
            if (req.showRequired === undefined && (!req.flags || req.flags.hidden === undefined)) {
              req.showRequired = false;
            }
          });
        });
      } else {
        // try window.game.data.sections
        try {
          const sections = window.wrappedJSObject.game?.data?.sections || window.game?.data?.sections;
          if (sections) {
            const process = (section) => {
              if (section.cards && section.cards.length) {
                Array.prototype.forEach.call(section.cards, (card) => {
                  if (card.requirements && card.requirements.length > 0) {
                    Array.prototype.forEach.call(card.requirements, (req) => {
                      req.showRequired = !req.showRequired;
                    });
                  }
                });
              }
            };
            if (rowIndex !== null) {
              if (sections[rowIndex]) {
                process(sections[rowIndex]);
              }
            } else {
              Array.prototype.forEach.call(sections, process);
            }
            try {
              window.wrappedJSObject.game.updateAfterToggle?.();
            } catch (e) {
              window.game.updateAfterToggle?.();
            }
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const script = document.createElement('script');
          script.textContent = 'try { const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project"); if (s && s.store && s.store.file && s.store.file.data) { const raw = s.store; const d = raw.file.data; const newData = Object.assign({}, d, { rows: (d.rows || []).slice(), pointTypes: (d.pointTypes || []).slice() }); const newFile = Object.assign({}, raw.file, { data: newData }); s.store = Object.assign({}, raw, { file: newFile }); } } catch (e) {}';
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

function showAllRequirements(rowIndex = null) {
  try {
    (() => {
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
      let isNuxt = false;
      if (!app) {
        // try nuxt + pinia (ltouroumov version)
        try {
          // Try with wrappedJSObject first
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) {
          try {
            // Fallback to without wrappedJSObject
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            isNuxt = true;
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

      if (app && app.rows) {
        function allThings(func) {
          if (rowIndex !== null) {
            // Handle single row
            if (app.rows[rowIndex]) {
              allObjects(app.rows[rowIndex], func);
            }
          } else {
            // Handle all rows
            Array.prototype.forEach.call(app.rows, (row) => allObjects(row, func));
          }
        }

        function allObjects(row, func) {
          func(row);
          const items = row.perks || row.objects || row.cards;
          if (items && items.length) {
            Array.prototype.forEach.call(items, (child) => allObjects(child, func));
          }
        }

        function getRequirementItems(obj) {
          const req = obj.requirement || obj.requireds || obj.requirements;
          if (!req) return [];
          const items = [];
          if (Array.isArray(req)) {
            items.push(...req);
          } else if (typeof req === 'object') {
            if (Array.isArray(req.and)) items.push(...req.and);
            if (Array.isArray(req.or)) items.push(...req.or);
            if (!req.and && !req.or) items.push(req);
          }
          return items;
        }

        allThings((obj) => {
          const reqItems = getRequirementItems(obj);
          reqItems.forEach((req) => {
            req.showRequired = true;
            if (req.flags && typeof req.flags === 'object') {
              req.flags.hidden = false;
            }
          });
        });
      } else {
        // try window.game.data.sections
        try {
          const sections = window.wrappedJSObject.game?.data?.sections || window.game?.data?.sections;
          if (sections) {
            const process = (section) => {
              if (section.cards && section.cards.length) {
                Array.prototype.forEach.call(section.cards, (card) => {
                  if (card.requirements && card.requirements.length > 0) {
                    Array.prototype.forEach.call(card.requirements, (req) => {
                      req.showRequired = true;
                    });
                  }
                });
              }
            };
            if (rowIndex !== null) {
              if (sections[rowIndex]) {
                process(sections[rowIndex]);
              }
            } else {
              Array.prototype.forEach.call(sections, process);
            }
            try {
              window.wrappedJSObject.game.updateAfterToggle?.();
            } catch (e) {
              window.game.updateAfterToggle?.();
            }
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const script = document.createElement('script');
          script.textContent = 'try { const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project"); if (s && s.store && s.store.file && s.store.file.data) { const raw = s.store; const d = raw.file.data; const newData = Object.assign({}, d, { rows: (d.rows || []).slice(), pointTypes: (d.pointTypes || []).slice() }); const newFile = Object.assign({}, raw.file, { data: newData }); s.store = Object.assign({}, raw, { file: newFile }); } } catch (e) {}';
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

function removeRequirements(rowIndex = null) {
  try {
    (() => {
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
      let isNuxt = false;
      if (!app) {
        // try nuxt + pinia (ltouroumov version)
        try {
          // Try with wrappedJSObject first
          app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) {
          try {
            // Fallback to without wrappedJSObject
            app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
            isNuxt = true;
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

      if (app && app.rows) {
        function allThings(func) {
          if (rowIndex !== null) {
            // Handle single row
            if (app.rows[rowIndex]) {
              allObjects(app.rows[rowIndex], func);
            }
          } else {
            // Handle all rows
            Array.prototype.forEach.call(app.rows, (row) => allObjects(row, func));
          }
        }

        function allObjects(row, func) {
          func(row);
          const items = row.perks || row.objects || row.cards;
          if (items && items.length) {
            Array.prototype.forEach.call(items, (child) => allObjects(child, func));
          }
        }

        allThings((obj) => {
          if (obj.requirement) {
            if (typeof obj.requirement === 'object') {
              if (Array.isArray(obj.requirement.and)) obj.requirement.and.length = 0;
              if (Array.isArray(obj.requirement.or)) obj.requirement.or.length = 0;
            }
            if (Array.isArray(obj.requirement)) obj.requirement.length = 0;
            delete obj.requirement;
          }
          if (obj.requireds) {
            if (Array.isArray(obj.requireds)) obj.requireds.length = 0;
            delete obj.requireds;
          }
          if (obj.requirements) {
            if (Array.isArray(obj.requirements)) obj.requirements.length = 0;
            delete obj.requirements;
          }
        });
      } else {
        // try window.game.data.sections
        try {
          const sections = window.wrappedJSObject.game?.data?.sections || window.game?.data?.sections;
          if (sections) {
            const process = (section) => {
              if (section.cards && section.cards.length) {
                Array.prototype.forEach.call(section.cards, (card) => {
                  delete card.requirements;
                });
              }
            };
            if (rowIndex !== null) {
              if (sections[rowIndex]) {
                process(sections[rowIndex]);
              }
            } else {
              Array.prototype.forEach.call(sections, process);
            }
            try {
              window.wrappedJSObject.game.updateAfterToggle?.();
            } catch (e) {
              window.game.updateAfterToggle?.();
            }
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const script = document.createElement('script');
          script.textContent = 'try { const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project"); if (s && s.store && s.store.file && s.store.file.data) { const raw = s.store; const d = raw.file.data; const newData = Object.assign({}, d, { rows: (d.rows || []).slice(), pointTypes: (d.pointTypes || []).slice() }); const newFile = Object.assign({}, raw.file, { data: newData }); s.store = Object.assign({}, raw, { file: newFile }); } } catch (e) {}';
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

async function getCurrentTab() {
  try {
    let tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) return tabs[0];
    tabs = await browser.tabs.query({ active: true });
    return tabs ? tabs[0] : undefined;
  } catch (e) {
    let tabs = await browser.tabs.query({ active: true });
    return tabs ? tabs[0] : undefined;
  }
}

function injectedFetchData() {
  let app = undefined;
  try { app = document.querySelector('#app').wrappedJSObject.__vue__.$store.state.app; } catch (e) { }
  if (!app) try { app = document.querySelector('#app').__vue__.$store.state.app; } catch (e) { }
  if (!app) try { app = document.getElementById("__nuxt").wrappedJSObject.__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data; } catch (e) { }
  if (!app) try { app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data; } catch (e) { }
  if (!app) try { app = window.wrappedJSObject.debugApp; } catch (e) { }
  if (!app) try { app = window.debugApp; } catch (e) { }

  let points = null;
  let rows = null;

  if (app && app.pointTypes) {
    points = Array.from(app.pointTypes).map((point) => ({
      name: point.name,
      value: point.startingSum
    }));
  } else {
    try {
      const gamePoints = window.wrappedJSObject.game?.state?.points || window.game?.state?.points;
      if (gamePoints) {
        points = Object.entries(gamePoints).map(([name, value]) => ({ name, value }));
      }
    } catch (e) { }
  }

  if (app && app.rows) {
    rows = Array.from(app.rows).map((row) => ({
      name: row.name || row.title || '', id: row.id, hasObjects: !!(row.objects && row.objects.length),
      allowedChoices: row.allowedChoices !== undefined ? row.allowedChoices : 0
    }));
  } else {
    try {
      const sections = window.wrappedJSObject.game?.data?.sections || window.game?.data?.sections;
      if (sections) {
        rows = Array.from(sections).map((section, index) => ({ name: section.id || '', id: index, hasObjects: false, maxSelections: section.maxSelections !== undefined ? section.maxSelections : 0 }));
      }
    } catch (e) { }
  }

  return { points, rows };
}

async function refreshData() {
  let tab = await getCurrentTab();
  if (!tab) return;
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: injectedFetchData
    });

    for (const result of results) {
      if (result.result && (result.result.points || result.result.rows)) {
        const data = result.result;
        if (data.points && data.points.length > 0) {
          updatePoints(data.points, result.frameId);
        }
        if (data.rows && document.getElementById('row-actions-container').childNodes.length === 0 && data.rows.length > 0) {
          updateRowControls(data.rows, result.frameId);
        }
        break;
      }
    }
  } catch (e) {
    if (document.getElementById('debug-log')) document.getElementById('debug-log').textContent = 'Refresh Err: ' + e.message;
  }
}

refreshData();
setInterval(refreshData, 500);
