const stateByModelViewer = new WeakMap();

const RESTORE_DEBOUNCE_MS = 200;
const SCREENSHOT_DEBOUNCE_MS = 250;
const SCREENSHOT_FALLBACK_MS = 300;
const TRANSITION_END_DEBOUNCE_MS = 250;
const TRANSITION_NO_CHANGE_FALLBACK_MS = 300;
const CHANGE_SOURCE_USER_INTERACTION = 'user-interaction';
const TAU = Math.PI * 2;

function normalizeRadians(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = (value + Math.PI) / TAU;
  return (normalized - Math.floor(normalized)) * TAU - Math.PI;
}

function offsetOrbitTheta(orbit, thetaOffset) {
  return {
    ...orbit,
    theta: orbit.theta + thetaOffset,
  };
}

function clearTransitionTimer(state) {
  clearTimeout(state.transitionSettledTimeoutId);
}

function settleTransition(state) {
  const onTransitionSettled = state.onTransitionSettled;
  state.onTransitionSettled = null;
  clearTransitionTimer(state);
  onTransitionSettled?.();
}

/* The debounce (after the move stops emitting changes) and the no-change
   fallback (when the move emits nothing) never run at the same time, so they
   share a single timer field, like the screenshot path above. */
function scheduleTransitionSettle(state, delay) {
  clearTransitionTimer(state);
  state.transitionSettledTimeoutId = setTimeout(() => {
    settleTransition(state);
  }, delay);
}

function getState(modelViewer) {
  let state = stateByModelViewer.get(modelViewer);

  if (!state) {
    state = {
      baseInterpolationDecay: null,
      restoreInterpolationDecayTimeoutId: null,
      screenshotPending: false,
      takeScreenshotTimeoutId: null,
      takeScreenshot: null,
      transitionSettledTimeoutId: null,
      onTransitionSettled: null,
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

      if (state.onTransitionSettled) {
        if (source === CHANGE_SOURCE_USER_INTERACTION) {
          settleTransition(state);
        } else {
          scheduleTransitionSettle(state, TRANSITION_END_DEBOUNCE_MS);
        }
      }
    });

    stateByModelViewer.set(modelViewer, state);
  }

  return state;
}

export function toModelViewerOrbit(markerOrbit, turntableRotation) {
  return offsetOrbitTheta(markerOrbit, normalizeRadians(turntableRotation));
}

export function toStoredMarkerOrbit(cameraOrbit, turntableRotation) {
  return offsetOrbitTheta(cameraOrbit, -normalizeRadians(turntableRotation));
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

export function requestGoToMarkerTransitionSettled(
  modelViewer,
  onTransitionSettled,
) {
  const state = getState(modelViewer);

  state.onTransitionSettled = onTransitionSettled;
  scheduleTransitionSettle(state, TRANSITION_NO_CHANGE_FALLBACK_MS);
}

export function cancelGoToMarkerTransitionSettled(modelViewer) {
  const state = stateByModelViewer.get(modelViewer);
  if (!state) {
    return;
  }

  state.onTransitionSettled = null;
  clearTransitionTimer(state);
}
