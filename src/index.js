import PandaBridge from 'pandasuite-bridge';

import 'focus-visible';
import '@google/model-viewer/dist/model-viewer';

let properties = null;
let markers = null;

function myInit() {
  const modelViewer = document.querySelector('model-viewer');
  const modelUrl = `${PandaBridge.resolvePath('assets.zip', './')}${properties.path}`;

  PandaBridge.unlisten(PandaBridge.GET_SCREENSHOT);
  PandaBridge.getScreenshot(async (resultCallback) => {
    const blob = await modelViewer.toBlob({ idealAspect: false });
    const fileReader = new FileReader();
    fileReader.onload = (e) => { resultCallback(e.target.result); };
    fileReader.readAsDataURL(blob);
  });

  modelViewer.addEventListener('load', () => {
    PandaBridge.send(PandaBridge.INITIALIZED);
    PandaBridge.send('modelLoaded');
  });

  modelViewer.addEventListener('model-visibility', (e) => {
    if (e.detail.visible) {
      requestAnimationFrame(() => {
        if (PandaBridge.isStudio) {
          PandaBridge.takeScreenshot();
        }
      });
    }
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

  // eslint-disable-next-line no-use-before-define
  activatePanning();
}

function activatePanning() {
  const modelViewer = document.querySelector('model-viewer');
  const tapDistance = 2;
  let panning = false;
  let panX;
  let panY;
  let startX;
  let startY;
  let lastX;
  let lastY;
  let metersPerPixel;

  document.addEventListener('contextmenu', (event) => event.preventDefault());

  const startPan = () => {
    const orbit = modelViewer.getCameraOrbit();
    const { theta, phi, radius } = orbit;
    metersPerPixel = (0.75 * radius) / modelViewer.getBoundingClientRect().height;
    panX = [-Math.cos(theta), 0, Math.sin(theta)];
    panY = [
      -Math.cos(phi) * Math.sin(theta),
      Math.sin(phi),
      -Math.cos(phi) * Math.cos(theta),
    ];
    modelViewer.interactionPrompt = 'none';
  };

  const movePan = (thisX, thisY) => {
    const dx = (thisX - lastX) * metersPerPixel;
    const dy = (thisY - lastY) * metersPerPixel;
    lastX = thisX;
    lastY = thisY;

    const target = modelViewer.getCameraTarget();
    target.x += dx * panX[0] + dy * panY[0];
    target.y += dx * panX[1] + dy * panY[1];
    target.z += dx * panX[2] + dy * panY[2];
    modelViewer.cameraTarget = `${target.x}m ${target.y}m ${target.z}m`;
  };

  const recenter = (event) => {
    panning = false;
    if (Math.abs(event.clientX - startX) > tapDistance
        || Math.abs(event.clientY - startY) > tapDistance) return;
    const rect = modelViewer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = modelViewer.positionAndNormalFromPoint(x, y);
    modelViewer.cameraTarget = hit == null ? 'auto auto auto' : hit.position.toString();
  };

  modelViewer.addEventListener('mousedown', (event) => {
    PandaBridge.send('onTouchStart');
    startX = event.clientX;
    startY = event.clientY;
    panning = event.button === 2 || event.ctrlKey || event.metaKey
        || event.shiftKey;
    if (!panning || !properties.pan) return;

    lastX = startX;
    lastY = startY;
    startPan();
    event.stopPropagation();
  }, true);

  modelViewer.addEventListener('touchstart', (event) => {
    PandaBridge.send('onTouchStart');
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    panning = event.touches.length === 2;
    if (!panning || !properties.pan) return;

    const { touches } = event;
    lastX = 0.5 * (touches[0].clientX + touches[1].clientX);
    lastY = 0.5 * (touches[0].clientY + touches[1].clientY);
    startPan();
  }, true);

  modelViewer.addEventListener('mousemove', (event) => {
    if (!panning || !properties.pan) return;

    movePan(event.clientX, event.clientY);
    event.stopPropagation();
  }, true);

  modelViewer.addEventListener('touchmove', (event) => {
    if (!panning || event.touches.length !== 2 || !properties.pan) return;

    const { touches } = event;
    const thisX = 0.5 * (touches[0].clientX + touches[1].clientX);
    const thisY = 0.5 * (touches[0].clientY + touches[1].clientY);
    movePan(thisX, thisY);
  }, true);

  document.addEventListener('mouseup', (event) => {
    PandaBridge.send('onTouchEnd');
    recenter(event);
  }, true);

  document.addEventListener('touchend', (event) => {
    PandaBridge.send('onTouchEnd');
    if (event.touches.length === 0) {
      recenter(event.changedTouches[0]);
    }
  }, true);
}

function goToMarker(marker, notAnimated, takeScreenshot) {
  const { theta, phi, radius } = marker;
  const modelViewer = document.querySelector('model-viewer');

  if (notAnimated) {
    modelViewer.jumpCameraToGoal();
  }
  modelViewer.cameraOrbit = `${theta}rad ${phi}rad ${radius}m`;

  if (takeScreenshot) {
    setTimeout(() => {
      if (PandaBridge.isStudio) {
        PandaBridge.takeScreenshot();
      }
    }, 300);
  }
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
    const { isDefault } = pandaData.params;

    goToMarker(pandaData.data, !isDefault && !properties.animateMarkers, isDefault);
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
