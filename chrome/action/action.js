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
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => !!(window.__VUE3_ICC_APP__),
        world: chrome.scripting.ExecutionWorld.MAIN
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

    chrome.scripting.executeScript({
      target: target,
      func: addCustomPointType,
      args: [name],
      world: chrome.scripting.ExecutionWorld.MAIN
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

getCurrentTab().then((tab) => {
  if (tab && tab.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: getRowsInfo,
      args: [chrome.runtime.id],
      world: chrome.scripting.ExecutionWorld.MAIN
    });
  }
}).catch(() => { });

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  const tab = await getCurrentTab();

  if (!tab || message.tabId === tab.id || (sender.tab && sender.tab.id === tab.id)) {
    if (actionsContainer.style.display !== 'flex') {
      actionsContainer.style.display = 'flex';
    }
    const frameId = message.frameId !== undefined ? message.frameId : sender.frameId;
    switch (message.type) {
      case 'points':
        updatePoints(message.points, frameId);
        // After receiving points, get row information
        getCurrentTab().then((tab) => {
          const target = { tabId: tab.id };
          if (frameId !== undefined) {
            target.frameIds = [frameId];
          }
          chrome.scripting.executeScript({
            target: target,
            func: getRowsInfo,
            args: [chrome.runtime.id],
            world: chrome.scripting.ExecutionWorld.MAIN
          });
        });
        break;
      case 'rows':
        updateRowControls(message.rows, frameId);
        break;
    }
  }
});

function getRowsInfo(extId) {
  try {
    (() => {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.__VUE3_ICC_APP__;
        } catch (e) { }
      }

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
        if (extId) {
          chrome.runtime.sendMessage(extId, { type: 'rows', rows });
        } else {
          chrome.runtime.sendMessage({ type: 'rows', rows });
        }
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
  rowLimitInput.value = row.allowedChoices !== undefined ? row.allowedChoices : (row.maxSelections !== undefined ? row.maxSelections : 0);
  rowLimitInput.onchange = () => {
    const newLimit = parseInt(rowLimitInput.value, 10) || 0;
    getCurrentTab().then((tab) => {
      const target = { tabId: tab.id };
      if (frameId !== undefined) {
        target.frameIds = [frameId];
      }
      chrome.scripting.executeScript({
        target: target,
        func: setRowLimit,
        args: [index, newLimit],
        world: chrome.scripting.ExecutionWorld.MAIN
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
      const target = { tabId: tab.id };
      if (frameId !== undefined) {
        target.frameIds = [frameId];
      }
      chrome.scripting.executeScript({
        target: target,
        func: removeRowLimits,
        args: [index],
        world: chrome.scripting.ExecutionWorld.MAIN
      });
    });
  };

  const removeRequirementsBtn = document.createElement('button');
  removeRequirementsBtn.textContent = 'Remove Requirements';
  removeRequirementsBtn.onclick = () => {
    getCurrentTab().then((tab) => {
      const target = { tabId: tab.id };
      if (frameId !== undefined) {
        target.frameIds = [frameId];
      }
      chrome.scripting.executeScript({
        target: target,
        func: removeRequirements,
        args: [index],
        world: chrome.scripting.ExecutionWorld.MAIN
      });
    });
  };

  const removeRandomnessBtn = document.createElement('button');
  removeRandomnessBtn.textContent = 'Remove Randomness';
  removeRandomnessBtn.onclick = () => {
    getCurrentTab().then((tab) => {
      const target = { tabId: tab.id };
      if (frameId !== undefined) {
        target.frameIds = [frameId];
      }
      chrome.scripting.executeScript({
        target: target,
        func: removeRandomness,
        args: [index],
        world: chrome.scripting.ExecutionWorld.MAIN
      });
    });
  };

  const toggleRequirementsBtn = document.createElement('button');
  toggleRequirementsBtn.textContent = 'Toggle Requirements';
  toggleRequirementsBtn.onclick = () => {
    getCurrentTab().then((tab) => {
      const target = { tabId: tab.id };
      if (frameId !== undefined) {
        target.frameIds = [frameId];
      }
      chrome.scripting.executeScript({
        target: target,
        func: toggleAllRequirements,
        args: [index],
        world: chrome.scripting.ExecutionWorld.MAIN
      });
    });
  };

  const makeButtonsRepeatableBtn = document.createElement('button');
  makeButtonsRepeatableBtn.textContent = 'Buttons are now repeatable';
  makeButtonsRepeatableBtn.onclick = () => {
    getCurrentTab().then((tab) => {
      const target = { tabId: tab.id };
      if (frameId !== undefined) {
        target.frameIds = [frameId];
      }
      chrome.scripting.executeScript({
        target: target,
        func: makeButtonsRepeatable,
        args: [index],
        world: chrome.scripting.ExecutionWorld.MAIN
      });
    });
  };

  // Create third container
  const thirdContainer = document.createElement('div');
  thirdContainer.className = 'row-button-container';

  // Add buttons to left container
  leftContainer.appendChild(removeRowLimitsBtn);
  leftContainer.appendChild(removeRequirementsBtn);

  // Add buttons to right container
  rightContainer.appendChild(removeRandomnessBtn);
  rightContainer.appendChild(toggleRequirementsBtn);

  // Add buttons to third container
  thirdContainer.appendChild(makeButtonsRepeatableBtn);

  // Add all elements to main container
  container.appendChild(rowLimitInput);
  container.appendChild(rowNameElem);
  container.appendChild(leftContainer);
  container.appendChild(rightContainer);
  container.appendChild(thirdContainer);
  return container;
}

function updateRowControls(rows, frameId) {
  const rowActionsContainer = document.getElementById('row-actions-container');
  if (!rowActionsContainer) return;

  // If rows already exist with the same count, just update values in-place
  const existingRows = rowActionsContainer.querySelectorAll('.row-actions');
  if (existingRows.length === rows.length && rows.length > 0) {
    rows.forEach((row, index) => {
      const input = existingRows[index].querySelector('.row-limit-input');
      if (input && input !== document.activeElement) {
        const newValue = row.allowedChoices !== undefined ? row.allowedChoices : (row.maxSelections !== undefined ? row.maxSelections : 0);
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
            const target = { tabId: tab.id };
            if (frameId !== undefined) {
              target.frameIds = [frameId];
            }
            chrome.scripting.executeScript({
              target: target,
              func: updatePoint,
              args: [index, value],
              world: chrome.scripting.ExecutionWorld.MAIN
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
            const target = { tabId: tab.id };
            if (frameId !== undefined) {
              target.frameIds = [frameId];
            }
            chrome.scripting.executeScript({
              target: target,
              func: updatePoint,
              args: [index, newValue],
              world: chrome.scripting.ExecutionWorld.MAIN
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
            const target = { tabId: tab.id };
            if (frameId !== undefined) {
              target.frameIds = [frameId];
            }
            chrome.scripting.executeScript({
              target: target,
              func: updatePoint,
              args: [index, newValue],
              world: chrome.scripting.ExecutionWorld.MAIN
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
            const target = { tabId: tab.id };
            if (frameId !== undefined) {
              target.frameIds = [frameId];
            }
            chrome.scripting.executeScript({
              target: target,
              func: updatePoint,
              args: [index, newValue],
              world: chrome.scripting.ExecutionWorld.MAIN
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
            const target = { tabId: tab.id };
            if (frameId !== undefined) {
              target.frameIds = [frameId];
            }
            chrome.scripting.executeScript({
              target: target,
              func: updatePoint,
              args: [index, newValue],
              world: chrome.scripting.ExecutionWorld.MAIN
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
            const target = { tabId: tab.id };
            if (frameId !== undefined) {
              target.frameIds = [frameId];
            }
            chrome.scripting.executeScript({
              target: target,
              func: updatePoint,
              args: [index, newValue],
              world: chrome.scripting.ExecutionWorld.MAIN
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
            const target = { tabId: tab.id };
            if (frameId !== undefined) {
              target.frameIds = [frameId];
            }
            chrome.scripting.executeScript({
              target: target,
              func: updatePoint,
              args: [index, newValue],
              world: chrome.scripting.ExecutionWorld.MAIN
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
      let app = undefined;
      let pointName = undefined;
      try {
        // try vue
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }

      let vue3App = undefined;
      try {
        vue3App = window.__VUE3_ICC_APP__;
      } catch (e) { }

      if (vue3App || window.__VUE3_ICC_APP__) {
        try {
          const app = window.__VUE3_ICC_APP__;
          if (app && app.rows && app.rows.length > 0) {
            const rows = app.rows;
            const isDb = window.location.href.includes('/dragonballs/');
            const targetRow = isDb ? rows[0] : rows[rows.length - 1];
            if (targetRow && targetRow.perks && targetRow.perks.length > 0) {
              const perks = targetRow.perks;
              const targetPerk = isDb ? perks[0] : perks[perks.length - 1];
              if (targetPerk) {
                if (!targetPerk.cost || !Array.isArray(targetPerk.cost)) targetPerk.cost = [];
                if (targetPerk.cost[index]) {
                  targetPerk.cost[index].value = -value;
                }
              }
            }
          }
        } catch (e) { }
        return;
      }

      if (!app) {
        // try window.game.state.points
        try {
          if (window.game?.state?.points) {
            const pointTypes = Object.keys(window.game.state.points);
            pointName = pointTypes[index];
            if (pointName) {
              window.game.state.points[pointName] = value;
              window.game.updateAfterToggle?.();
              return;
            }
          } else if (window.playerState?.metaResources) {
            const pointTypes = Object.keys(window.playerState.metaResources);
            pointName = pointTypes[index];
            if (pointName) {
              window.playerState.metaResources[pointName] = value;
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
          const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project");
          if (s && s.store && s.store.file && s.store.file.data) {
            const raw = s.store;
            const d = raw.file.data;
            const newData = Object.assign({}, d, {
              rows: (d.rows || []).slice(),
              pointTypes: (d.pointTypes || []).slice()
            });
            const newFile = Object.assign({}, raw.file, { data: newData });
            s.store = Object.assign({}, raw, { file: newFile });
          }
        } catch (e) { }
      }
    })()
  } catch (e) { }
}

function addCustomPointType(pointName) {
  try {
    let vue3App = undefined;
    try {
      vue3App = window.__VUE3_ICC_APP__;
    } catch (e) { }

    if (vue3App && vue3App.rows && vue3App.rows.length > 0) {
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
        }
      }
    }
  } catch (e) { }
}

document.getElementById('remove-row-limits-button').onclick = async () => {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: removeRowLimits,
      world: chrome.scripting.ExecutionWorld.MAIN
    });
  } catch (e) { }
};

function removeRowLimits(rowIndex = null) {
  try {
    (() => {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.__VUE3_ICC_APP__;
        } catch (e) { }
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
          if (obj.maxChosen !== undefined) obj.maxChosen = 0;
          obj.allowedChoices = 0;
        });
      } else {
        // try window.game.data.sections
        try {
          const sections = window.game?.data?.sections;
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
            window.game.updateAfterToggle?.();
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project");
          if (s && s.store && s.store.file && s.store.file.data) {
            const raw = s.store;
            const d = raw.file.data;
            const newData = Object.assign({}, d, {
              rows: (d.rows || []).slice(),
              pointTypes: (d.pointTypes || []).slice()
            });
            const newFile = Object.assign({}, raw.file, { data: newData });
            s.store = Object.assign({}, raw, { file: newFile });
          }
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
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.__VUE3_ICC_APP__;
        } catch (e) { }
      }

      if (app && app.rows) {
        if (app.rows[rowIndex]) {
          if (app.rows[rowIndex].maxChosen !== undefined) app.rows[rowIndex].maxChosen = value;
          app.rows[rowIndex].allowedChoices = value;
        }
      } else {
        // try window.game.data.sections
        try {
          const sections = window.game?.data?.sections;
          if (sections && sections[rowIndex]) {
            sections[rowIndex].maxSelections = value;
            window.game.updateAfterToggle?.();
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project");
          if (s && s.store && s.store.file && s.store.file.data) {
            const raw = s.store;
            const d = raw.file.data;
            const newData = Object.assign({}, d, {
              rows: (d.rows || []).slice(),
              pointTypes: (d.pointTypes || []).slice()
            });
            const newFile = Object.assign({}, raw.file, { data: newData });
            s.store = Object.assign({}, raw, { file: newFile });
          }
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

document.getElementById('remove-randomness-button').onclick = async () => {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: removeRandomness,
      world: chrome.scripting.ExecutionWorld.MAIN
    });
  } catch (e) { }
};

function removeRandomness(rowIndex = null) {
  try {
    (() => {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.__VUE3_ICC_APP__;
        } catch (e) { }
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
        const items = row.perks || row.objects || row.cards;
        if (items && items.length) {
          Array.prototype.forEach.call(items, (child) => allObjects(child, func));
        }
      }
      allThings((obj) => obj.isInfoRow && (obj.isInfoRow = false));
      if (isNuxt) {
        try {
          const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project");
          if (s && s.store && s.store.file && s.store.file.data) {
            const raw = s.store;
            const d = raw.file.data;
            const newData = Object.assign({}, d, {
              rows: (d.rows || []).slice(),
              pointTypes: (d.pointTypes || []).slice()
            });
            const newFile = Object.assign({}, raw.file, { data: newData });
            s.store = Object.assign({}, raw, { file: newFile });
          }
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

document.getElementById('remove-requirements-button').onclick = async () => {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: removeRequirements,
      world: chrome.scripting.ExecutionWorld.MAIN
    });
  } catch (e) { }
};

document.getElementById('toggle-requirements-button').onclick = async () => {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: toggleAllRequirements,
      world: chrome.scripting.ExecutionWorld.MAIN
    });
  } catch (e) { }
};

document.getElementById('show-requirements-button').onclick = async () => {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: showAllRequirements,
      world: chrome.scripting.ExecutionWorld.MAIN
    });
  } catch (e) { }
};

document.getElementById('make-buttons-repeatable-button').onclick = async () => {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: (await getCurrentTab()).id,
        allFrames: true
      },
      func: makeButtonsRepeatable,
      world: chrome.scripting.ExecutionWorld.MAIN
    });
  } catch (e) { }
};

function makeButtonsRepeatable(rowIndex = null) {
  try {
    (() => {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.__VUE3_ICC_APP__;
        } catch (e) { }
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
          if (obj && obj.onlyIfNoChoices === true) {
            obj.onlyIfNoChoices = false;
          }
        });
      } else {
        // try window.game.data.sections
        try {
          const sections = window.game?.data?.sections;
          if (sections) {
            const process = (section) => {
              if (section && section.onlyIfNoChoices === true) {
                section.onlyIfNoChoices = false;
              }
              const items = section.cards || section.perks || section.objects;
              if (items && items.length) {
                Array.prototype.forEach.call(items, (item) => {
                  if (item && item.onlyIfNoChoices === true) {
                    item.onlyIfNoChoices = false;
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
              window.game.updateAfterToggle?.();
            } catch (e) { }
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

function toggleAllRequirements(rowIndex = null) {
  try {
    (() => {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.__VUE3_ICC_APP__;
        } catch (e) { }
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
          const sections = window.game?.data?.sections;
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
            window.game.updateAfterToggle?.();
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project");
          if (s && s.store && s.store.file && s.store.file.data) {
            const raw = s.store;
            const d = raw.file.data;
            const newData = Object.assign({}, d, {
              rows: (d.rows || []).slice(),
              pointTypes: (d.pointTypes || []).slice()
            });
            const newFile = Object.assign({}, raw.file, { data: newData });
            s.store = Object.assign({}, raw, { file: newFile });
          }
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
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.__VUE3_ICC_APP__;
        } catch (e) { }
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
          const sections = window.game?.data?.sections;
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
            window.game.updateAfterToggle?.();
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project");
          if (s && s.store && s.store.file && s.store.file.data) {
            const raw = s.store;
            const d = raw.file.data;
            const newData = Object.assign({}, d, {
              rows: (d.rows || []).slice(),
              pointTypes: (d.pointTypes || []).slice()
            });
            const newFile = Object.assign({}, raw.file, { data: newData });
            s.store = Object.assign({}, raw, { file: newFile });
          }
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
        app = document.querySelector('#app').__vue__.$store.state.app;
      } catch (e) { }
      let isNuxt = false;
      if (!app) {
        try {
          // try nuxt (ltouroumov version)
          app = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia.state._rawValue.project.store._value.file.data;
          isNuxt = true;
        } catch (e) { }
      }
      if (!app) {
        // try svelte
        app = window.debugApp;
      }
      if (!app) {
        // try vue 3 custom
        try {
          app = window.__VUE3_ICC_APP__;
        } catch (e) { }
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
          const sections = window.game?.data?.sections;
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
            window.game.updateAfterToggle?.();
          }
        } catch (e) { }
      }
      if (isNuxt) {
        try {
          const s = document.getElementById("__nuxt").__vue_app__.$nuxt.$pinia._s.get("project");
          if (s && s.store && s.store.file && s.store.file.data) {
            const raw = s.store;
            const d = raw.file.data;
            const newData = Object.assign({}, d, {
              rows: (d.rows || []).slice(),
              pointTypes: (d.pointTypes || []).slice()
            });
            const newFile = Object.assign({}, raw.file, { data: newData });
            s.store = Object.assign({}, raw, { file: newFile });
          }
        } catch (e) { }
      }
    })();
  } catch (e) { }
}

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}
