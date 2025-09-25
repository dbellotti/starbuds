import { createInitialInputState } from '@starbuds/shared';
import type { PlayerInputButton, PlayerInputState } from '@starbuds/shared';

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
  private enabled = true;

  constructor(private readonly getAimDirection: () => number) {
    this.state.aimDirection = 0;
    window.addEventListener('keydown', this.handleKeyDown, { passive: true });
    window.addEventListener('keyup', this.handleKeyUp, { passive: true });
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  getSnapshot(): PlayerInputState {
    if (!this.enabled) {
      return createInitialInputState();
    }
    this.state.aimDirection = this.getAimDirection();
    this.state.aimHeading = this.state.aimDirection;
    return { ...this.state };
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      for (const button of this.pressed) {
        this.state[button] = false;
      }
      this.pressed.clear();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled) {
      return;
    }
    if (event.repeat) {
      return;
    }
    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      this.setButton(binding, true);
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    if (!this.enabled) {
      return;
    }
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
    if (!this.enabled) {
      return;
    }
    if (event.button === 0) {
      this.setButton('primaryAbility', true);
    }
    if (event.button === 2) {
      this.setButton('secondaryAbility', true);
    }
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (!this.enabled) {
      return;
    }
    if (event.button === 0) {
      this.setButton('primaryAbility', false);
    }
    if (event.button === 2) {
      this.setButton('secondaryAbility', false);
    }
  };

  private setButton(button: PlayerInputButton, value: boolean) {
    if (!this.enabled) {
      return;
    }
    this.state[button] = value;
    if (value) {
      this.pressed.add(button);
    } else {
      this.pressed.delete(button);
    }
  }
}
