import PandaBridge from 'pandasuite-bridge';

import 'focus-visible';
import '@google/model-viewer/dist/model-viewer';

let properties = null;
let markers = null;

function myInit() {
  const modelViewer = document.querySelector('model-viewer');
  const modelUrl = `${PandaBridge.resolvePath('assets.zip', './')}${properties.path}`;

  modelViewer.addEventListener('load', () => {
    PandaBridge.send(PandaBridge.INITIALIZED);
    PandaBridge.send('modelLoaded');
  });

  modelViewer.addEventListener('error', () => {
    PandaBridge.send('modelError');
  });

  modelViewer.addEventListener('play', () => {
    PandaBridge.send('onStartingPlay');
  });

  modelViewer.addEventListener('pause', () => {
    PandaBridge.send('onPausePlaying');
  });

  modelViewer.setAttribute('src', modelUrl);
  modelViewer.setAttribute('interaction-prompt', properties.interactionPrompt ? 'auto' : 'none');
  modelViewer.setAttribute('interaction-prompt-threshold', properties.interactionPromptThreshold);

  if (properties.cameraControls) {
    modelViewer.setAttribute('camera-controls', true);
  } else {
    modelViewer.removeAttribute('camera-controls');
  }

  if (properties.lookInside) {
    modelViewer.setAttribute('min-camera-orbit', 'auto auto 0m');
  } else {
    modelViewer.removeAttribute('min-camera-orbit');
  }

  if (properties.arMode) {
    modelViewer.setAttribute('ar', true);
  } else {
    modelViewer.removeAttribute('ar');
  }

  if (properties.autoRotate) {
    modelViewer.setAttribute('auto-rotate', true);
    modelViewer.setAttribute('auto-rotate-delay', properties.autoRotateDelay);
  } else {
    modelViewer.removeAttribute('auto-rotate');
  }

  if (properties.arPath) {
    const arModelUrl = `${PandaBridge.resolvePath('assets.zip', './')}${properties.arPath}`;
    modelViewer.setAttribute('ios-src', arModelUrl);
  } else {
    modelViewer.removeAttribute('ios-src');
  }
}

function goToMarker(marker, notAnimated) {
  const { theta, phi, radius } = marker;
  const modelViewer = document.querySelector('model-viewer');

  if (notAnimated) {
    modelViewer.jumpCameraToGoal();
  }
  modelViewer.cameraOrbit = `${theta}rad ${phi}rad ${radius}m`;
}

PandaBridge.init(() => {
  PandaBridge.onLoad((pandaData) => {
    properties = pandaData.properties;
    markers = pandaData.markers;

    if (document.readyState === 'complete') {
      myInit();
    } else {
      document.addEventListener('DOMContentLoaded', myInit, false);
    }
  });

  PandaBridge.onUpdate((pandaData) => {
    properties = pandaData.properties;
    markers = pandaData.markers;

    myInit();
  });

  PandaBridge.getScreenshot((resultCallback) => {
    resultCallback(document.querySelector('model-viewer').toDataURL('image/png', 1));
  });

  /* Markers */

  PandaBridge.getSnapshotData(() => {
    const orbit = document.querySelector('model-viewer').getCameraOrbit();

    if (orbit) {
      return orbit;
    }
    return null;
  });

  PandaBridge.setSnapshotData((pandaData) => {
    goToMarker(pandaData.data, !properties.animateMarkers);
  });

  /* Actions */

  PandaBridge.listen('play', () => {
    document.querySelector('model-viewer').play();
  });

  PandaBridge.listen('pause', () => {
    document.querySelector('model-viewer').pause();
  });

  PandaBridge.listen('activateAR', () => {
    document.querySelector('model-viewer').activateAR();
  });

  PandaBridge.synchronize('synchroMarkers', (percent) => {
    const localPercent = ((markers.length - 1) * percent) / 100;

    const markerIndex = Math.floor(localPercent);
    const rest = localPercent - markerIndex;

    let marker = markers[markerIndex];

    if (rest !== 0) {
      const currentMarker = marker;
      const nextMarker = markers[markerIndex + 1];

      marker = {
        theta: currentMarker.theta + ((nextMarker.theta - currentMarker.theta) * rest),
        phi: currentMarker.phi + ((nextMarker.phi - currentMarker.phi) * rest),
        radius: currentMarker.radius + ((nextMarker.radius - currentMarker.radius) * rest),
      };
    }
    goToMarker(marker);
  });
});
