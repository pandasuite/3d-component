import PandaBridge from 'pandasuite-bridge';

import 'focus-visible';
import '@google/model-viewer/dist/model-viewer';

import {
  applyGoToMarkerInterpolationDecay,
  requestGoToMarkerScreenshot,
} from './goToMarkerCamera.js';

let properties = null;
let markers = null;
let lastMarker = null;
let hasLoaded = false;
let lastAnimationName = null;
let lastAppendAnimationPayload = null;
let lastDetachAnimationPayload = null;

function clampInt(value, min, max) {
  const integer = Number.parseInt(value, 10);
  if (Number.isNaN(integer)) return null;
  return Math.min(Math.max(integer, min), max);
}

function clampFloat(value, min, max) {
  const float = Number.parseFloat(value);
  if (Number.isNaN(float)) return null;
  if (min != null && float < min) return min;
  if (max != null && float > max) return max;
  return float;
}

function pickActionParams(args) {
  return Array.isArray(args) ? args[0] : args;
}

function getAnimationNameByIndex1(modelViewer, animationIndex1) {
  const availableAnimations = modelViewer.availableAnimations || [];
  if (availableAnimations.length === 0) return null;

  const index1 = clampInt(animationIndex1, 1, availableAnimations.length) || 1;
  return availableAnimations[index1 - 1];
}

function playWithAnimationIndex(args) {
  const modelViewer = document.querySelector('model-viewer');
  const availableAnimations = modelViewer.availableAnimations || [];

  const params = pickActionParams(args);
  const animationIndex1 =
    params && typeof params === 'object' ? params.animation : params;
  const loop = params && typeof params === 'object' ? params.loop : true;
  const repetitions =
    params && typeof params === 'object' ? params.repetitions : 1;
  const pingpong =
    params && typeof params === 'object' ? params.pingpong : false;

  if (availableAnimations.length === 0) {
    if (!hasLoaded) {
      modelViewer.addEventListener(
        'load',
        () => {
          playWithAnimationIndex(args);
        },
        { once: true },
      );
    } else {
      modelViewer.play();
    }
    return;
  }

  const options = {};

  if (pingpong) {
    options.pingpong = true;
    // pingpong loops infinitely in model-viewer
  } else if (!loop) {
    options.repetitions = clampInt(repetitions, 1, 10_000) || 1;
  }

  modelViewer.animationName =
    getAnimationNameByIndex1(modelViewer, animationIndex1) ||
    availableAnimations[0];
  lastAnimationName = modelViewer.animationName;
  modelViewer.play(options);
}

function getCurrentAnimationPayload() {
  const modelViewer = document.querySelector('model-viewer');
  const availableAnimations = modelViewer.availableAnimations || [];

  const name =
    modelViewer.animationName ||
    lastAnimationName ||
    availableAnimations[0] ||
    '';
  const index0 = name ? availableAnimations.indexOf(name) : -1;

  return {
    animation: index0 >= 0 ? index0 + 1 : 1,
    animationName: name,
  };
}

function appendAnimationByIndex(args) {
  const modelViewer = document.querySelector('model-viewer');
  const availableAnimations = modelViewer.availableAnimations || [];
  const params = pickActionParams(args) || {};

  if (availableAnimations.length === 0) {
    if (!hasLoaded) {
      modelViewer.addEventListener(
        'load',
        () => {
          appendAnimationByIndex(args);
        },
        { once: true },
      );
    }
    return;
  }

  if (typeof modelViewer.appendAnimation !== 'function') {
    return;
  }

  const animationName =
    getAnimationNameByIndex1(modelViewer, params.animation) ||
    availableAnimations[0];

  const loop = params.loop !== undefined ? params.loop : true;
  const repetitions = params.repetitions;
  const pingpong = !!params.pingpong;

  const fadeEnabled = !!params.fade;
  const fadeSeconds = clampFloat(params.fadeSeconds, 0, null);

  const warpEnabled = !!params.warp;
  const warpSeconds = clampFloat(params.warpSeconds, 0, null);
  const relativeWarp = params.relativeWarp !== false;

  const weight = clampFloat(params.weight, 0, 1);
  const timeScale = clampFloat(params.timeScale, null, null);
  const time = clampFloat(params.time, 0, null);

  const options = {};

  if (fadeEnabled) {
    options.fade = fadeSeconds != null ? fadeSeconds : true;
  } else if (weight != null) {
    options.weight = weight;
  }

  if (timeScale != null) {
    options.timeScale = timeScale;
  }

  if (warpEnabled) {
    options.warp = warpSeconds != null ? warpSeconds : true;
    options.relativeWarp = relativeWarp;
  }

  if (time != null) {
    options.time = time;
  }

  if (pingpong) {
    options.pingpong = true;
    // pingpong loops infinitely in model-viewer
  } else if (!loop) {
    options.repetitions = clampInt(repetitions, 1, 10_000) || 1;
  }

  lastAppendAnimationPayload = {
    animation: availableAnimations.indexOf(animationName) + 1,
    animationName,
  };

  modelViewer.appendAnimation(animationName, options);
}

function detachAnimationByIndex(args) {
  const modelViewer = document.querySelector('model-viewer');
  const availableAnimations = modelViewer.availableAnimations || [];
  const params = pickActionParams(args) || {};

  if (availableAnimations.length === 0) {
    if (!hasLoaded) {
      modelViewer.addEventListener(
        'load',
        () => {
          detachAnimationByIndex(args);
        },
        { once: true },
      );
    }
    return;
  }

  if (typeof modelViewer.detachAnimation !== 'function') {
    return;
  }

  const animationName =
    getAnimationNameByIndex1(modelViewer, params.animation) ||
    availableAnimations[0];

  const fadeEnabled = params.fade !== false;
  const fadeSeconds = clampFloat(params.fadeSeconds, 0, null);

  let options;
  if (!fadeEnabled) {
    options = { fade: false };
  } else if (fadeSeconds != null && fadeSeconds !== 1.5) {
    options = { fade: fadeSeconds };
  } else {
    options = undefined;
  }

  lastDetachAnimationPayload = {
    animation: availableAnimations.indexOf(animationName) + 1,
    animationName,
  };

  modelViewer.detachAnimation(animationName, options);
}

function myInit(update) {
  const modelViewer = document.querySelector('model-viewer');
  const modelUrl = `${PandaBridge.resolvePath('assets.zip', './')}${
    properties.path
  }`;

  if (!update && PandaBridge.isStudio) {
    setupAddHotspot();
  }

  PandaBridge.unlisten(PandaBridge.GET_SCREENSHOT);
  PandaBridge.getScreenshot(async (resultCallback) => {
    const blob = await modelViewer.toBlob({ idealAspect: false });
    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      resultCallback(e.target.result);
    };
    fileReader.readAsDataURL(blob);
  });

  modelViewer.addEventListener('load', () => {
    hasLoaded = true;
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
    PandaBridge.send('onStartingPlay', [getCurrentAnimationPayload()]);
  });

  modelViewer.addEventListener('pause', () => {
    PandaBridge.send('onPausePlaying', [getCurrentAnimationPayload()]);
  });

  modelViewer.addEventListener('append-animation', () => {
    PandaBridge.send('onAppendAnimation', [lastAppendAnimationPayload || {}]);
  });

  modelViewer.addEventListener('detach-animation', () => {
    PandaBridge.send('onDetachAnimation', [lastDetachAnimationPayload || {}]);
  });

  modelViewer.addEventListener('ar-status', (event) => {
    if (event.detail.status === 'failed') {
      PandaBridge.send('arError');
    }
  });

  modelViewer.addEventListener('mousedown', () => {
    PandaBridge.send('onTouchStart');
  });

  modelViewer.addEventListener('mouseup', () => {
    PandaBridge.send('onTouchEnd');
  });

  modelViewer.addEventListener('touchstart', () => {
    PandaBridge.send('onTouchStart');
  });

  modelViewer.addEventListener('touchend', () => {
    PandaBridge.send('onTouchEnd');
  });

  modelViewer.setAttribute('src', modelUrl);
  modelViewer.setAttribute(
    'interaction-prompt',
    properties.interactionPrompt ? 'auto' : 'none',
  );
  modelViewer.setAttribute(
    'interaction-prompt-threshold',
    properties.interactionPromptThreshold,
  );
  modelViewer.setAttribute('disable-tap', true);

  modelViewer.setAttribute('exposure', properties.exposure);
  modelViewer.setAttribute('shadow-intensity', properties.shadowIntensity);
  modelViewer.setAttribute('shadow-softness', properties.shadowSoftness);
  modelViewer.setAttribute('tone-mapping', properties.toneMapping);

  if (properties.environment === 'custom') {
    const environmentUrl = PandaBridge.resolvePath('environment.jpg');

    if (environmentUrl) {
      modelViewer.setAttribute('environment-image', environmentUrl);
      if (properties.environmentAsSkybox) {
        modelViewer.setAttribute('skybox-image', environmentUrl);
        modelViewer.setAttribute(
          'skybox-height',
          `${properties.skyboxHeight}${properties.skyboxHeightUnit}`,
        );
      } else {
        modelViewer.removeAttribute('skybox-image');
        modelViewer.removeAttribute('skybox-height');
      }
    } else {
      modelViewer.removeAttribute('environment-image');
      modelViewer.removeAttribute('skybox-image');
      modelViewer.removeAttribute('skybox-height');
    }
  } else {
    modelViewer.setAttribute('environment-image', properties.environment);
  }

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

  if (!properties.pan) {
    modelViewer.setAttribute('disable-pan', true);
  } else {
    modelViewer.removeAttribute('disable-pan');
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

  if (properties.arMode && properties.arModeIOS) {
    const arModelUrl = `${PandaBridge.resolvePath('assets.zip', './')}${
      properties.arPath
    }`;
    modelViewer.setAttribute('ios-src', arModelUrl);
  } else {
    modelViewer.removeAttribute('ios-src');
  }

  if (markers) {
    const markerIds = {};

    markers.forEach((marker) => {
      if (marker.type === 'hotspot') {
        createUpdateHotspot(marker);
        markerIds[marker.id] = true;
      }
    });

    const existingHotspots = modelViewer.querySelectorAll('.hotspot');
    existingHotspots.forEach((hotspot) => {
      const id = hotspot.getAttribute('slot').replace('hotspot-', '');
      if (!markerIds[id]) {
        hotspot.remove();
      }
    });
  }
}

function createUpdateHotspot({
  position,
  normal,
  id,
  color,
  size,
  minOpacity,
  maxOpacity,
  showAnnotation,
  description,
  annotationColor,
  annotationTextColor,
}) {
  const modelViewer = document.querySelector('model-viewer');
  const hotspotName = `hotspot-${id}`;

  const styleForHotspot = (hotspot) => {
    if (color !== undefined) {
      hotspot.style.setProperty('--hotspot-color', color);
    }
    if (size !== undefined) {
      hotspot.style.setProperty('--hotspot-size', `${size}px`);
      hotspot.style.setProperty('--hotspot-radius', `${size / 2}px`);
    }
    if (minOpacity !== undefined) {
      hotspot.style.setProperty('--min-hotspot-opacity', minOpacity);
    }
    if (maxOpacity !== undefined) {
      hotspot.style.setProperty('--max-hotspot-opacity', maxOpacity);
    }
  };

  const styleForAnnotation = (annotation) => {
    if (annotationColor !== undefined) {
      annotation.style.setProperty(
        '--annotation-background-color',
        annotationColor,
      );
    }
    if (annotationTextColor !== undefined) {
      annotation.style.setProperty('--annotation-color', annotationTextColor);
    }
  };

  if (modelViewer.queryHotspot(hotspotName)) {
    const hotspot = modelViewer.querySelector(`[slot="${hotspotName}"]`);
    styleForHotspot(hotspot);

    modelViewer.updateHotspot({
      position: `${position.x}m ${position.y}m ${position.z}m`,
      normal: `${normal.x} ${normal.y} ${normal.z}`,
      name: hotspotName,
    });

    if (showAnnotation) {
      let annotation = hotspot.querySelector('.annotation');

      if (!annotation) {
        annotation = document.createElement('div');
        annotation.classList.add('annotation');
        hotspot.appendChild(annotation);
      }
      styleForAnnotation(annotation);
      annotation.textContent = description;
    } else {
      const annotation = hotspot.querySelector('.annotation');
      if (annotation) {
        annotation.remove();
      }
    }
  } else {
    const hotspot = document.createElement('button');
    hotspot.classList.add('hotspot');
    hotspot.setAttribute(
      'data-position',
      `${position.x}m ${position.y}m ${position.z}m`,
    );
    hotspot.setAttribute('data-normal', `${normal.x} ${normal.y} ${normal.z}`);
    hotspot.setAttribute('data-visibility-attribute', 'visible');
    hotspot.setAttribute('slot', hotspotName);
    styleForHotspot(hotspot);

    if (showAnnotation) {
      const annotation = document.createElement('div');
      annotation.classList.add('annotation');
      styleForAnnotation(annotation);
      annotation.textContent = description;
      hotspot.appendChild(annotation);
    }
    modelViewer.appendChild(hotspot);

    hotspot.addEventListener('click', () => {
      PandaBridge.send(PandaBridge.TRIGGER_MARKER, id);
    });
  }
}

function setupAddHotspot() {
  const isFrench =
    properties[PandaBridge.LANGUAGE] &&
    properties[PandaBridge.LANGUAGE].startsWith('fr');
  const button = document.createElement('button');
  button.textContent = isFrench ? 'Ajouter un hotspot' : 'Add Hotspot';
  button.classList.add('hotspot-button');
  document.body.appendChild(button);

  button.addEventListener('click', () => {
    const modelViewer = document.querySelector('model-viewer');
    modelViewer.style.pointerEvents = 'none';

    const hotspotOverlay = document.createElement('div');
    hotspotOverlay.classList.add('hotspot-overlay');
    hotspotOverlay.textContent = isFrench
      ? 'Cliquez pour ajouter un hotspot'
      : 'Click to add a hotspot';
    document.body.appendChild(hotspotOverlay);

    const addHotspot = (e) => {
      hotspotOverlay.removeEventListener('click', addHotspot);

      const hotspotData = modelViewer.positionAndNormalFromPoint(
        e.clientX,
        e.clientY,
      );

      if (hotspotData) {
        const marker = {
          ...hotspotData,
          id: Math.random().toString(36).substr(2, 9),
          type: 'hotspot',
        };
        markers.push(marker);

        /* Don't pass an array for updating only the existing marker */
        PandaBridge.send(PandaBridge.UPDATED, { markers: marker });

        createUpdateHotspot(marker);
      }

      hotspotOverlay.remove();
      modelViewer.style.pointerEvents = '';
    };
    hotspotOverlay.addEventListener('click', addHotspot);
  });
}

function goToMarker(marker, notAnimated, takeScreenshot, interpolationDecay) {
  const modelViewer = document.querySelector('model-viewer');
  const { orbit, target, fieldOfView } = marker;

  if (!notAnimated) {
    const safeInterpolationDecay = clampInt(interpolationDecay, 1, 10000);
    applyGoToMarkerInterpolationDecay(modelViewer, safeInterpolationDecay);
  }

  modelViewer.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`;
  modelViewer.cameraTarget = `${target.x}m ${target.y}m ${target.z}m`;
  modelViewer.fieldOfView = fieldOfView;

  if (notAnimated) {
    modelViewer.jumpCameraToGoal();
  }

  if (takeScreenshot) {
    requestGoToMarkerScreenshot(modelViewer, () => {
      if (PandaBridge.isStudio) {
        PandaBridge.takeScreenshot();
      }
    });
  }
}

function blinkHotspot(id) {
  const modelViewer = document.querySelector('model-viewer');
  const hotspot = modelViewer.querySelector(`[slot="hotspot-${id}"]`);

  if (hotspot) {
    hotspot.addEventListener(
      'animationend',
      () => {
        hotspot.classList.remove('blink-animation');
      },
      { once: true },
    );
    hotspot.classList.add('blink-animation');
  }
}

PandaBridge.init(() => {
  PandaBridge.onLoad((pandaData) => {
    properties = pandaData.properties;
    markers = pandaData.markers;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', myInit, false);
    } else {
      myInit();
    }
  });

  PandaBridge.onUpdate((pandaData) => {
    properties = pandaData.properties;
    markers = pandaData.markers;

    myInit(true);
  });

  PandaBridge.getScreenshot((resultCallback) => {
    resultCallback(
      document.querySelector('model-viewer').toDataURL('image/png', 1),
    );
  });

  /* Markers */

  PandaBridge.getSnapshotData(() => {
    const modelViewer = document.querySelector('model-viewer');
    const orbit = modelViewer.getCameraOrbit();
    const target = modelViewer.getCameraTarget();
    const fieldOfView = modelViewer.getFieldOfView();

    if (orbit && target) {
      return {
        orbit,
        target,
        fieldOfView,
        type: `${orbit.theta.toFixed(4)}, ${orbit.phi.toFixed(
          4,
        )}, ${orbit.radius.toFixed(4)}`,
      };
    }
    return null;
  });

  PandaBridge.setSnapshotData((pandaData) => {
    const { isDefault, interpolationDecay } = pandaData.params || {};
    const { id, type } = pandaData.data;

    if (type === 'hotspot') {
      if (PandaBridge.isStudio && id !== lastMarker) {
        blinkHotspot(id);
        lastMarker = id;
      }
    } else {
      goToMarker(
        pandaData.data,
        !isDefault && !properties.animateMarkers,
        isDefault,
        interpolationDecay,
      );
    }
  });

  /* Actions */

  PandaBridge.listen('play', (args) => {
    playWithAnimationIndex(args);
  });

  PandaBridge.listen('pause', () => {
    document.querySelector('model-viewer').pause();
  });

  PandaBridge.listen('appendAnimation', (args) => {
    appendAnimationByIndex(args);
  });

  PandaBridge.listen('detachAnimation', (args) => {
    detachAnimationByIndex(args);
  });

  PandaBridge.listen('activateAR', () => {
    const modelViewer = document.querySelector('model-viewer');

    if (!modelViewer.canActivateAR) {
      PandaBridge.send('arError');
    } else {
      modelViewer.activateAR();
    }
  });

  PandaBridge.listen('recenter', () => {
    const modelViewer = document.querySelector('model-viewer');
    modelViewer.cameraTarget = 'auto auto auto';
  });

  PandaBridge.synchronize('synchroMarkers', (percent) => {
    const animationMarkers = markers.filter(
      (marker) => marker.type !== 'hotspot',
    );
    const localPercent = ((animationMarkers.length - 1) * percent) / 100;

    const markerIndex = Math.floor(localPercent);
    const rest = localPercent - markerIndex;

    let marker = animationMarkers[markerIndex];

    if (rest !== 0) {
      const currentMarker = marker;
      const nextMarker = animationMarkers[markerIndex + 1];

      marker = {
        orbit: {
          theta:
            currentMarker.orbit.theta +
            (nextMarker.orbit.theta - currentMarker.orbit.theta) * rest,
          phi:
            currentMarker.orbit.phi +
            (nextMarker.orbit.phi - currentMarker.orbit.phi) * rest,
          radius:
            currentMarker.orbit.radius +
            (nextMarker.orbit.radius - currentMarker.orbit.radius) * rest,
        },
        target: {
          x:
            currentMarker.target.x +
            (nextMarker.target.x - currentMarker.target.x) * rest,
          y:
            currentMarker.target.y +
            (nextMarker.target.y - currentMarker.target.y) * rest,
          z:
            currentMarker.target.z +
            (nextMarker.target.z - currentMarker.target.z) * rest,
        },
        fieldOfView:
          currentMarker.fieldOfView +
          (nextMarker.fieldOfView - currentMarker.fieldOfView) * rest,
      };
    }
    goToMarker(marker);
  });
});
