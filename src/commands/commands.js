function markPendingAction(action) {
  if (typeof OfficeRuntime === "undefined" || !OfficeRuntime.storage) {
    return Promise.resolve();
  }
  return OfficeRuntime.storage.setItem("contractLens.pendingAction", action);
}

function completeEvent(event) {
  if (event && typeof event.completed === "function") {
    event.completed();
  }
}

async function quickReview(event) {
  try {
    await markPendingAction("quickReview");
    if (Office.addin?.showAsTaskpane) {
      await Office.addin.showAsTaskpane();
    }
  } finally {
    completeEvent(event);
  }
}

async function clearAiCommentsFromRibbon(event) {
  try {
    await markPendingAction("clearAiComments");
    if (Office.addin?.showAsTaskpane) {
      await Office.addin.showAsTaskpane();
    }
  } finally {
    completeEvent(event);
  }
}

Office.onReady(() => {
  Office.actions.associate("quickReview", quickReview);
  Office.actions.associate("clearAiCommentsFromRibbon", clearAiCommentsFromRibbon);
});
