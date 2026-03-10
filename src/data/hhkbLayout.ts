import { FarmCell } from '../types/game';

// HHKB layout: 4 rows (skipping bottom row for POC)
// Row 0: Esc 1 2 3 4 5 6 7 8 9 0 - = \ `  (15 keys)
// Row 1: Tab Q W E R T Y U I O P [ ] Del   (14 keys, Tab=1.5w, Del=1.5w)
// Row 2: Ctrl A S D F G H J K L ; ' Return (13 keys, Ctrl=1.75w, Return=2.25w)
// Row 3: Shift Z X C V B N M , . / Shift Fn (13 keys, LShift=2.25w, RShift=1.75w)

interface KeyDef {
  keyCode: string;
  label: string;
  width: number; // 1 = standard key width
}

const ROW_0: KeyDef[] = [
  { keyCode: 'Escape', label: 'Esc', width: 1 },
  { keyCode: 'Num1', label: '1', width: 1 },
  { keyCode: 'Num2', label: '2', width: 1 },
  { keyCode: 'Num3', label: '3', width: 1 },
  { keyCode: 'Num4', label: '4', width: 1 },
  { keyCode: 'Num5', label: '5', width: 1 },
  { keyCode: 'Num6', label: '6', width: 1 },
  { keyCode: 'Num7', label: '7', width: 1 },
  { keyCode: 'Num8', label: '8', width: 1 },
  { keyCode: 'Num9', label: '9', width: 1 },
  { keyCode: 'Num0', label: '0', width: 1 },
  { keyCode: 'Minus', label: '-', width: 1 },
  { keyCode: 'Equal', label: '=', width: 1 },
  { keyCode: 'BackSlash', label: '\\', width: 1 },
  { keyCode: 'BackQuote', label: '`', width: 1 },
];

const ROW_1: KeyDef[] = [
  { keyCode: 'Tab', label: 'Tab', width: 1.5 },
  { keyCode: 'KeyQ', label: 'Q', width: 1 },
  { keyCode: 'KeyW', label: 'W', width: 1 },
  { keyCode: 'KeyE', label: 'E', width: 1 },
  { keyCode: 'KeyR', label: 'R', width: 1 },
  { keyCode: 'KeyT', label: 'T', width: 1 },
  { keyCode: 'KeyY', label: 'Y', width: 1 },
  { keyCode: 'KeyU', label: 'U', width: 1 },
  { keyCode: 'KeyI', label: 'I', width: 1 },
  { keyCode: 'KeyO', label: 'O', width: 1 },
  { keyCode: 'KeyP', label: 'P', width: 1 },
  { keyCode: 'LeftBracket', label: '[', width: 1 },
  { keyCode: 'RightBracket', label: ']', width: 1 },
  { keyCode: 'Delete', label: 'Del', width: 1.5 },
];

const ROW_2: KeyDef[] = [
  { keyCode: 'ControlLeft', label: 'Ctrl', width: 1.75 },
  { keyCode: 'KeyA', label: 'A', width: 1 },
  { keyCode: 'KeyS', label: 'S', width: 1 },
  { keyCode: 'KeyD', label: 'D', width: 1 },
  { keyCode: 'KeyF', label: 'F', width: 1 },
  { keyCode: 'KeyG', label: 'G', width: 1 },
  { keyCode: 'KeyH', label: 'H', width: 1 },
  { keyCode: 'KeyJ', label: 'J', width: 1 },
  { keyCode: 'KeyK', label: 'K', width: 1 },
  { keyCode: 'KeyL', label: 'L', width: 1 },
  { keyCode: 'SemiColon', label: ';', width: 1 },
  { keyCode: 'Quote', label: "'", width: 1 },
  { keyCode: 'Return', label: 'Ret', width: 2.25 },
];

const ROW_3: KeyDef[] = [
  { keyCode: 'ShiftLeft', label: 'Shift', width: 2.25 },
  { keyCode: 'KeyZ', label: 'Z', width: 1 },
  { keyCode: 'KeyX', label: 'X', width: 1 },
  { keyCode: 'KeyC', label: 'C', width: 1 },
  { keyCode: 'KeyV', label: 'V', width: 1 },
  { keyCode: 'KeyB', label: 'B', width: 1 },
  { keyCode: 'KeyN', label: 'N', width: 1 },
  { keyCode: 'KeyM', label: 'M', width: 1 },
  { keyCode: 'Comma', label: ',', width: 1 },
  { keyCode: 'Dot', label: '.', width: 1 },
  { keyCode: 'Slash', label: '/', width: 1 },
  { keyCode: 'ShiftRight', label: 'Shift', width: 1.75 },
  { keyCode: 'Function', label: 'Fn', width: 1 },
];

export const HHKB_ROWS: KeyDef[][] = [ROW_0, ROW_1, ROW_2, ROW_3];

export function createInitialCells(): Record<string, FarmCell> {
  const cells: Record<string, FarmCell> = {};

  HHKB_ROWS.forEach((row, rowIdx) => {
    let colOffset = 0;
    row.forEach((key) => {
      cells[key.keyCode] = {
        keyCode: key.keyCode,
        label: key.label,
        stage: 'empty',
        hitCount: 0,
        fruitType: null,
        row: rowIdx,
        col: colOffset,
        width: key.width,
      };
      colOffset += key.width;
    });
  });

  return cells;
}
