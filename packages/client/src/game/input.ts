import { PlayerInputButton, PlayerInputState, createInitialInputState } from '@farsight/shared';

const KEY_BINDINGS: Record<string, PlayerInputButton> = {
  KeyW: 'moveUp',
  ArrowUp: 'moveUp',
  KeyS: 'moveDown',
  ArrowDown: 'moveDown',
  KeyA: 'moveLeft',
  ArrowLeft: 'moveLeft',
  KeyD: 'moveRight',
  ArrowRight: 'moveRight',
  Space: 'dash',
  ShiftLeft: 'dash',
  Digit1: 'primaryAbility',
  Digit2: 'secondaryAbility',
  MouseLeft: 'primaryAbility',
  MouseRight: 'secondaryAbility'
};

export class InputController {
  private readonly state: PlayerInputState = createInitialInputState();
  private readonly pressed = new Set<PlayerInputButton>();

  constructor(private readonly getAimDirection: () => number) {
    this.state.aimDirection = 0;
    window.addEventListener('keydown', this.handleKeyDown, { passive: true });
    window.addEventListener('keyup', this.handleKeyUp, { passive: true });
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  getSnapshot(): PlayerInputState {
    this.state.aimDirection = this.getAimDirection();
    return { ...this.state };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) {
      return;
    }
    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      this.setButton(binding, true);
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      this.setButton(binding, false);
    }
  };

  private handleBlur = () => {
    for (const button of this.pressed) {
      this.state[button] = false;
    }
    this.pressed.clear();
  };

  private handlePointerDown = (event: PointerEvent) => {
    if (event.button === 0) {
      this.setButton('primaryAbility', true);
    }
    if (event.button === 2) {
      this.setButton('secondaryAbility', true);
    }
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.button === 0) {
      this.setButton('primaryAbility', false);
    }
    if (event.button === 2) {
      this.setButton('secondaryAbility', false);
    }
  };

  private setButton(button: PlayerInputButton, value: boolean) {
    this.state[button] = value;
    if (value) {
      this.pressed.add(button);
    } else {
      this.pressed.delete(button);
    }
  }
}
