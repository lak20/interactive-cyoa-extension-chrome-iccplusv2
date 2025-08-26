const pointsContainer = document.getElementById('points-container');
const actionsContainer = document.getElementById('actions-container');

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  const tab = await getCurrentTab();

  if (!tab || !sender.tab || sender.tab.id === tab.id) {
    if (actionsContainer.style.display !== 'flex') {
      actionsContainer.style.display = 'flex';
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
      } catch (e) {}
      if (!app) {
        try {
          app = document.querySelector('#app').__vue__.$store.state.app;
        } catch (e) {}
      }
      if (!app) {
        // try svelte
        try {
          app = window.wrappedJSObject.debugApp;
        } catch (e){}
        if (!app) {
          app = window.debugApp;
        }
      }

      function collectRowInfo(row) {
        return {
          name: row.name || row.title || '',
          id: row.id,
          hasObjects: !!(row.objects && row.objects.length)
        };
      }

      const rows = Array.from(app.rows).map(collectRowInfo);
      browser.runtime.sendMessage({ type: 'rows', rows });
    })();
  } catch (e) {}
}

function createRowActionButtons(row, index, frameId) {
  const container = document.createElement('div');
  container.className = 'row-actions';

  const rowNameElem = document.createElement('div');
  rowNameElem.className = 'row-name';
  rowNameElem.textContent = row.name || `Row ${index + 1}`;
  
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

  container.appendChild(rowNameElem);
  container.appendChild(removeRowLimitsBtn);
  container.appendChild(removeRequirementsBtn);
  container.appendChild(removeRandomnessBtn);
  return container;
}

function updateRowControls(rows, frameId) {
  const rowActionsContainer = document.getElementById('row-actions-container');
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
        } catch(e) {}
      };
      child.appendChild(nameElem);
      child.appendChild(valueElem);
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
      try {
        // try vue
        app = document.querySelector('#app').wrappedJSObject.__vue__.$store.state.app;
      } catch (e) {}
      if (!app) {
        try {
          app = document.querySelector('#app').__vue__.$store.state.app;
        } catch (e) {}
      }
      if (!app) {
        // try svelte
        try {
          app = window.wrappedJSObject.debugApp;
        } catch (e){}
        if (!app) {
          app = window.debugApp;
        }
      }

      app.pointTypes[index].startingSum = value;
    })()
  } catch(e) {}
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
  } catch(e) {}
};

function removeRowLimits(rowIndex = null) {
  try {
    (() => {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').wrappedJSObject.__vue__.$store.state.app;
      } catch (e) {}
      if (!app) {
        try {
          app = document.querySelector('#app').__vue__.$store.state.app;
        } catch (e) {}
      }
      if (!app) {
        // try svelte
        try {
          app = window.wrappedJSObject.debugApp;
        } catch (e){}
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

      allThings((obj) => obj.allowedChoices = 0);
    })();
  } catch (e) {}
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
  } catch(e) {}
};

function removeRandomness(rowIndex = null) {
  try {
    (() => {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').wrappedJSObject.__vue__.$store.state.app;
      } catch (e) {}
      if (!app) {
        try {
          app = document.querySelector('#app').__vue__.$store.state.app;
        } catch (e) {}
      }
      if (!app) {
        // try svelte
        try {
          app = window.wrappedJSObject.debugApp;
        } catch (e){}
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
    })();
  } catch (e) {}
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
  } catch (e) {}
};

function removeRequirements(rowIndex = null) {
  try {
    (() => {
      let app = undefined;
      try {
        // try vue
        app = document.querySelector('#app').wrappedJSObject.__vue__.$store.state.app;
      } catch (e) {}
      if (!app) {
        try {
          app = document.querySelector('#app').__vue__.$store.state.app;
        } catch (e) {}
      }
      if (!app) {
        // try svelte
        try {
          app = window.wrappedJSObject.debugApp;
        } catch (e){}
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
      allThings((obj) => obj.requireds.length = 0);
    })();
  } catch (e) {}
}

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  let [tab] = await browser.tabs.query(queryOptions);
  return tab;
}
