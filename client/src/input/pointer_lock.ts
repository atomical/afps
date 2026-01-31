export interface PointerLockController {
  supported: boolean;
  request: () => void;
  isLocked: () => boolean;
  dispose: () => void;
}

export interface PointerLockOptions {
  document: Document;
  element: HTMLElement;
  onChange?: (locked: boolean) => void;
  bindClick?: boolean;
}

type LockElement = HTMLElement & { requestPointerLock?: () => void };

export const createPointerLockController = ({
  document,
  element,
  onChange,
  bindClick = true
}: PointerLockOptions): PointerLockController => {
  const target = element as LockElement;
  const supported = typeof target.requestPointerLock === 'function';

  const request = () => {
    if (supported) {
      target.requestPointerLock?.();
    }
  };

  const isLocked = () => document.pointerLockElement === element;

  const handleChange = () => {
    onChange?.(isLocked());
  };

  const handleError = () => {
    onChange?.(false);
  };

  if (bindClick) {
    element.addEventListener('click', request);
  }
  document.addEventListener('pointerlockchange', handleChange);
  document.addEventListener('pointerlockerror', handleError);

  const dispose = () => {
    if (bindClick) {
      element.removeEventListener('click', request);
    }
    document.removeEventListener('pointerlockchange', handleChange);
    document.removeEventListener('pointerlockerror', handleError);
  };

  return { supported, request, isLocked, dispose };
};
