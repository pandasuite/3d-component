import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelGoToMarkerTransitionSettled,
  requestGoToMarkerTransitionSettled,
  toModelViewerOrbit,
  toStoredMarkerOrbit,
} from './goToMarkerCamera.js';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test('converts a stored marker orbit for model-viewer playback', () => {
  const markerOrbit = { theta: 1, phi: 1.2, radius: 3 };

  assert.deepEqual(
    toModelViewerOrbit(markerOrbit, 0.25),
    { theta: 1.25, phi: 1.2, radius: 3 },
  );
  assert.deepEqual(markerOrbit, { theta: 1, phi: 1.2, radius: 3 });
});

test('converts a model-viewer camera orbit for stable marker storage', () => {
  const cameraOrbit = { theta: 1.25, phi: 1.2, radius: 3 };

  assert.deepEqual(
    toStoredMarkerOrbit(cameraOrbit, 0.25),
    { theta: 1, phi: 1.2, radius: 3 },
  );
  assert.deepEqual(cameraOrbit, { theta: 1.25, phi: 1.2, radius: 3 });
});

test('uses equivalent wrapped turntable angles for stable marker values', () => {
  const markerOrbit = { theta: 1, phi: 1.2, radius: 3 };
  const wrappedTurntableRotation = 0.25;
  const equivalentTurntableRotation = Math.PI * 4 + wrappedTurntableRotation;

  assert.deepEqual(
    toModelViewerOrbit(markerOrbit, equivalentTurntableRotation),
    { theta: 1.25, phi: 1.2, radius: 3 },
  );
});

test('waits for camera changes to settle before ending a transition', async () => {
  const modelViewer = new EventTarget();
  let transitionEndCount = 0;

  requestGoToMarkerTransitionSettled(modelViewer, () => {
    transitionEndCount += 1;
  });

  modelViewer.dispatchEvent(new CustomEvent('camera-change'));
  await wait(100);
  modelViewer.dispatchEvent(new CustomEvent('camera-change'));
  await wait(180);

  assert.equal(transitionEndCount, 0);

  await wait(100);

  assert.equal(transitionEndCount, 1);
});

test('settles via the no-change fallback when no camera change arrives', async () => {
  const modelViewer = new EventTarget();
  let transitionEndCount = 0;

  requestGoToMarkerTransitionSettled(modelViewer, () => {
    transitionEndCount += 1;
  });

  await wait(250);
  assert.equal(transitionEndCount, 0);

  await wait(100);
  assert.equal(transitionEndCount, 1);
});

test('settles immediately when the user takes over during the transition', () => {
  const modelViewer = new EventTarget();
  let transitionEndCount = 0;

  requestGoToMarkerTransitionSettled(modelViewer, () => {
    transitionEndCount += 1;
  });

  modelViewer.dispatchEvent(
    new CustomEvent('camera-change', {
      detail: { source: 'user-interaction' },
    }),
  );

  assert.equal(transitionEndCount, 1);
});

test('cancels a pending transition settle without invoking the callback', async () => {
  const modelViewer = new EventTarget();
  let transitionEndCount = 0;

  requestGoToMarkerTransitionSettled(modelViewer, () => {
    transitionEndCount += 1;
  });
  cancelGoToMarkerTransitionSettled(modelViewer);

  modelViewer.dispatchEvent(new CustomEvent('camera-change'));
  await wait(350);

  assert.equal(transitionEndCount, 0);
});
