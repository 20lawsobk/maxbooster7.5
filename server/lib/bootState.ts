let _routesReady = false;

export function setRoutesReady(): void {
  _routesReady = true;
}

export function isRoutesReady(): boolean {
  return _routesReady;
}
