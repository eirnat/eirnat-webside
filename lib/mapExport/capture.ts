import type maplibregl from 'maplibre-gl';

export type LayerVisibilitySnapshot = Record<string, 'visible' | 'none'>;

export const hideMapLayers = (
  mapInstance: maplibregl.Map,
  layerIds: readonly string[]
): LayerVisibilitySnapshot => {
  const previous: LayerVisibilitySnapshot = {};
  for (const layerId of layerIds) {
    if (!mapInstance.getLayer(layerId)) continue;
    try {
      const visibility = mapInstance.getLayoutProperty(layerId, 'visibility');
      previous[layerId] =
        typeof visibility === 'string' && (visibility === 'visible' || visibility === 'none')
          ? visibility
          : 'visible';
      mapInstance.setLayoutProperty(layerId, 'visibility', 'none');
    } catch {
      // lag finnes ikke eller støtter ikke visibility
    }
  }
  return previous;
};

export const restoreMapLayers = (
  mapInstance: maplibregl.Map,
  previous: LayerVisibilitySnapshot
): void => {
  for (const [layerId, visibility] of Object.entries(previous)) {
    try {
      mapInstance.setLayoutProperty(layerId, 'visibility', visibility);
    } catch {
      // ignorer
    }
  }
  mapInstance.triggerRepaint();
};

export const waitForMapIdle = (mapInstance: maplibregl.Map, timeoutMs = 500): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    mapInstance.once('idle', () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(finish);
      });
    });
    mapInstance.triggerRepaint();
    window.setTimeout(finish, timeoutMs);
  });

export type ContainerSizeSnapshot = {
  width: string;
  height: string;
  aspectRatio: string;
  maxHeight: string;
  maxWidth: string;
  className: string;
};

export const captureMapAtResolution = async (
  mapInstance: maplibregl.Map,
  container: HTMLDivElement,
  targetWidth: number,
  targetHeight: number
): Promise<{ canvas: HTMLCanvasElement; cssWidth: number; cssHeight: number }> => {
  const snapshot: ContainerSizeSnapshot = {
    width: container.style.width,
    height: container.style.height,
    aspectRatio: container.style.aspectRatio,
    maxHeight: container.style.maxHeight,
    maxWidth: container.style.maxWidth,
    className: container.className
  };

  container.style.width = `${targetWidth}px`;
  container.style.height = `${targetHeight}px`;
  container.style.aspectRatio = '';
  container.style.maxHeight = '';
  container.style.maxWidth = '';
  container.className = container.className
    .replace(/\baspect-\[4\/3\]\b/g, '')
    .replace(/\bmax-h-full\b/g, '')
    .trim();

  mapInstance.resize();
  await waitForMapIdle(mapInstance, 800);

  const mapCanvas = mapInstance.getCanvas();
  const cssWidth = mapCanvas.getBoundingClientRect().width;
  const cssHeight = mapCanvas.getBoundingClientRect().height;

  const copyCanvas = document.createElement('canvas');
  copyCanvas.width = mapCanvas.width;
  copyCanvas.height = mapCanvas.height;
  const copyCtx = copyCanvas.getContext('2d');
  if (copyCtx) {
    copyCtx.drawImage(mapCanvas, 0, 0);
  }

  container.style.width = snapshot.width;
  container.style.height = snapshot.height;
  container.style.aspectRatio = snapshot.aspectRatio;
  container.style.maxHeight = snapshot.maxHeight;
  container.style.maxWidth = snapshot.maxWidth;
  container.className = snapshot.className;

  mapInstance.resize();
  await waitForMapIdle(mapInstance, 500);

  return { canvas: copyCanvas, cssWidth, cssHeight };
};
