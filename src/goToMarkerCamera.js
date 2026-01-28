const stateByModelViewer = new WeakMap();

const RESTORE_DEBOUNCE_MS = 200;
const SCREENSHOT_DEBOUNCE_MS = 250;
const SCREENSHOT_FALLBACK_MS = 300;
const CHANGE_SOURCE_USER_INTERACTION = 'user-interaction';

function getState(modelViewer) {
  let state = stateByModelViewer.get(modelViewer);

  if (!state) {
    state = {
      baseInterpolationDecay: null,
      restoreInterpolationDecayTimeoutId: null,
      screenshotPending: false,
      takeScreenshotTimeoutId: null,
      takeScreenshot: null,
    };

    modelViewer.addEventListener('camera-change', (event) => {
      const source = event?.detail?.source;

      if (source === CHANGE_SOURCE_USER_INTERACTION) {
        if (state.baseInterpolationDecay !== null) {
          clearTimeout(state.restoreInterpolationDecayTimeoutId);
          modelViewer.interpolationDecay = state.baseInterpolationDecay;
          state.baseInterpolationDecay = null;
        }
      }

      if (state.baseInterpolationDecay !== null) {
        clearTimeout(state.restoreInterpolationDecayTimeoutId);
        state.restoreInterpolationDecayTimeoutId = setTimeout(() => {
          modelViewer.interpolationDecay = state.baseInterpolationDecay;
          state.baseInterpolationDecay = null;
        }, RESTORE_DEBOUNCE_MS);
      }

      if (state.screenshotPending) {
        clearTimeout(state.takeScreenshotTimeoutId);
        state.takeScreenshotTimeoutId = setTimeout(() => {
          state.screenshotPending = false;
          state.takeScreenshot?.();
        }, SCREENSHOT_DEBOUNCE_MS);
      }
    });

    stateByModelViewer.set(modelViewer, state);
  }

  return state;
}

export function applyGoToMarkerInterpolationDecay(
  modelViewer,
  interpolationDecay,
) {
  if (!Number.isFinite(interpolationDecay) || interpolationDecay <= 0) {
    return;
  }

  const state = getState(modelViewer);

  if (state.baseInterpolationDecay === null) {
    state.baseInterpolationDecay = modelViewer.interpolationDecay;
  }

  modelViewer.interpolationDecay = interpolationDecay;

  clearTimeout(state.restoreInterpolationDecayTimeoutId);
  state.restoreInterpolationDecayTimeoutId = setTimeout(() => {
    modelViewer.interpolationDecay = state.baseInterpolationDecay;
    state.baseInterpolationDecay = null;
  }, RESTORE_DEBOUNCE_MS);
}

export function requestGoToMarkerScreenshot(modelViewer, takeScreenshot) {
  const state = getState(modelViewer);
  state.takeScreenshot = takeScreenshot;
  state.screenshotPending = true;

  clearTimeout(state.takeScreenshotTimeoutId);
  state.takeScreenshotTimeoutId = setTimeout(() => {
    state.screenshotPending = false;
    state.takeScreenshot?.();
  }, SCREENSHOT_FALLBACK_MS);
}
