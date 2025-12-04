
import type { Editor, EditorPosition } from "obsidian";



export interface MarkRegionResult {
  selection: string;
  markSelectionMade: boolean;
  from: EditorPosition;
  to: EditorPosition;
}

/**
 * Expands the selection if the cursor is inside a <mark ...>...</mark> region.
 * - If text is already selected, nothing changes.
 * - If no text is selected and the cursor is inside a <mark>, selects the full mark region.
 * - Otherwise selection stays empty.
 *
 * Returns:
 *   selection           → updated selected text
 *   markSelectionMade   → true if we auto-selected a <mark> region
 *   from, to            → updated cursor positions
 */
export function selectMarkRegionIfInside(editor: Editor, makeSelection=true): MarkRegionResult {
  let selection = editor.getSelection() ?? "";
  let markSelectionMade = false;

  const cursor = editor.getCursor();
  const line = cursor.line;
  const lineText = editor.getLine(line) ?? "";

  // Only attempt to expand if nothing is selected
  if (!selection) {
    let markStart = -1;
    let markEnd = -1;
    let searchPos = 0;

    while (true) {
      const openIdx = lineText.indexOf("<mark", searchPos);
      if (openIdx === -1) break;

      const closeIdxRaw = lineText.indexOf("</mark>", openIdx);
      if (closeIdxRaw === -1) break;

      const closeIdx = closeIdxRaw + "</mark>".length;

      // Check if cursor is inside this <mark>...</mark> block
      if (cursor.ch >= openIdx && cursor.ch <= closeIdx) {
        markStart = openIdx;
        markEnd = closeIdx;
        break;
      }

      searchPos = closeIdx;
    }

    if (markStart !== -1 && markEnd !== -1) {
      if (makeSelection) {
        // Select the entire <mark ...>...</mark> block
        editor.setSelection(
          { line, ch: markStart },
          { line, ch: markEnd }
        );
      }

      selection = editor.getSelection() ?? "";
      markSelectionMade = true;
    }
  }

  const from = editor.getCursor("from");
  const to = editor.getCursor("to");

  return { selection, markSelectionMade, from, to };
}

export interface WordSelectionResult {
  selection: string;
  from: EditorPosition;
  to: EditorPosition;
  wordSelected: boolean; // true if we auto-selected a word
}

/**
 * If nothing is selected, expands selection to the "word" under the cursor.
 * A "word" is defined as continuous characters bounded by spaces.
 *
 * Returns:
 *   selection     → updated selection (word or original)
 *   from, to      → updated selection bounds
 *   wordSelected  → true if the helper auto-selected a word
 */
export function selectWordIfNone(editor: Editor): WordSelectionResult {
  let selection = editor.getSelection() ?? "";
  let wordSelected = false;

  if (!selection) {
    const cursor = editor.getCursor();
    const line = cursor.line;
    const lineText = editor.getLine(line) ?? "";

    let startCh = cursor.ch;
    let endCh = cursor.ch;

    // Move left until space or start of line
    while (startCh > 0 && lineText[startCh - 1] !== " ") {
      startCh--;
    }

    // Move right until space or end of line
    while (endCh < lineText.length && lineText[endCh] !== " ") {
      endCh++;
    }

    editor.setSelection(
      { line, ch: startCh },
      { line, ch: endCh }
    );

    selection = editor.getSelection() ?? "";
    wordSelected = true;
  }

  const from = editor.getCursor("from");
  const to = editor.getCursor("to");

  return { selection, from, to, wordSelected };
}
