import { Editor, Menu, Plugin, PluginManifest } from "obsidian";
import { wait } from "src/utils/util";
import { selectMarkRegionIfInside, selectWordIfNone } from "src/utils/selectRegion";
import addIcons from "src/icons/customIcons";
import { HighlightrSettingTab } from "../settings/settingsTab";
import { HighlightrSettings } from "../settings/settingsData";
import DEFAULT_SETTINGS from "../settings/settingsData";
import contextMenu from "src/plugin/contextMenu";
import highlighterMenu from "src/ui/highlighterMenu";
import { createHighlighterIcons } from "src/icons/customIcons";

import { createStyles } from "src/utils/createStyles";
import { EnhancedApp, EnhancedEditor } from "src/settings/types";

export default class HighlightrPlugin extends Plugin {
  app: EnhancedApp;
  editor: EnhancedEditor;
  manifest: PluginManifest;
  settings: HighlightrSettings;

  async onload() {
    console.log(`Highlightr v${this.manifest.version} loaded`);
    addIcons();

    await this.loadSettings();

    this.app.workspace.onLayoutReady(() => {
      this.reloadStyles(this.settings);
      createHighlighterIcons(this.settings, this);
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", this.handleHighlighterInContextMenu)
    );

    this.addSettingTab(new HighlightrSettingTab(this.app, this));

    this.addCommand({
      id: "highlighter-plugin-menu",
      name: "Open Highlightr",
      icon: "highlightr-pen",
      editorCallback: (editor: EnhancedEditor) => {
        const { markSelectionMade } = selectMarkRegionIfInside(editor, false);

        // If toggling behavior is enabled and selection has a <mark>, erase instead of opening menu
        if (
          this.settings.useTogglingBehavior &&
          markSelectionMade
        ) {
          this.eraseHighlight(editor);
          return;
        }

        if (!document.querySelector(".menu.highlighterContainer")) {
          highlighterMenu(this.app, this.settings, editor);
        }

      },
    });

    addEventListener("Highlightr-NewCommand", () => {
      this.reloadStyles(this.settings);
      this.generateCommands(this.editor);
      createHighlighterIcons(this.settings, this);
    });
    this.generateCommands(this.editor);
    this.refresh();
  }

  reloadStyles(settings: HighlightrSettings) {
    let currentSheet = document.querySelector("style#highlightr-styles");
    if (currentSheet) {
      currentSheet.remove();
      createStyles(settings);
    } else {
      createStyles(settings);
    }
  }

  eraseHighlight = (editor: Editor) => {
    const { to, from, markSelectionMade } = selectMarkRegionIfInside(editor);

    const currentStr = editor.getRange(from, to);
    const newStr = currentStr
      .replace(/\<mark style.*?[^\>]\>/g, "")
      .replace(/\<mark class.*?[^\>]\>/g, "")
      .replace(/\<\/mark>/g, "");

    editor.replaceRange(newStr, from, to);
    
    if (this.settings.useTogglingBehavior && newStr.length > 0) {
      const lines = newStr.split("\n");

      let newTo;
      if (lines.length === 1) {
        newTo = {
          line: from.line,
          ch: from.ch + lines[0].length,
        };
      } else {
        newTo = {
          line: from.line + (lines.length - 1),
          ch: lines[lines.length - 1].length,
        };
      }

      if (!markSelectionMade) {
        // If user actually had text selected -> keep it selected after erase
        editor.setSelection(from, newTo);
      } else {
        // If selection was auto-created by the helper -> collapse to caret
        editor.setCursor(newTo);
      }
    } else if (markSelectionMade) {
      // Toggling behavior is off, but we auto-selected a mark region.
      // Collapse selection so we don't leave an auto-selection hanging.
      editor.setCursor(from);
    }

    editor.focus();
  };

  generateCommands(editor: Editor) {
    this.settings.highlighterOrder.forEach((highlighterKey: string) => {
      const applyCommand = (command: CommandPlot, editor: Editor) => {
        let { selection: selectedText, from: curserStart, to: curserEnd, wordSelected } =
          selectWordIfNone(editor);

        const prefix = command.prefix; 
        const suffix = command.suffix || prefix;

        if (this.settings.useTogglingBehavior) {
          // If the selection already contains any <mark>, we treat this as "remove highlight"
          if (selectedText && /<mark\b[^>]*>/i.test(selectedText)) {
            const newStr = selectedText
              .replace(/\<mark style.*?[^\>]\>/g, "")
              .replace(/\<mark class.*?[^\>]\>/g, "")
              .replace(/\<\/mark>/g, "");

            editor.replaceSelection(newStr);

            // Re-select the resulting text (now without the <mark> tags)
            const newTo = {
              line: curserStart.line,
              ch: curserStart.ch + newStr.length,
            };
            editor.setSelection(curserStart, newTo);
            return;
          } else {
            // If no <mark> in selection, apply highlight with this command's prefix/suffix
            editor.replaceSelection(`${prefix}${selectedText}${suffix}`);

            if (selectedText && selectedText.length > 0 && !wordSelected) {
              // Select the entire <mark ...>selectedText</mark> region
              const newTo = {
                line: curserStart.line,
                ch:
                  curserStart.ch +
                  prefix.length +
                  selectedText.length +
                  suffix.length,
              };
              editor.setSelection(curserStart, newTo);
            } else {
              // No prior selection: place cursor between prefix and suffix
              const caretPos = curserStart.ch + prefix.length;
              editor.setCursor(curserStart.line, caretPos);
            }
            return;
          }
        }

        const setCursor = (mode: number) => {
          editor.setCursor(
            curserStart.line + command.line * mode,
            curserEnd.ch + cursorPos * mode
          );
        };
        const cursorPos =
          selectedText.length > 0
            ? prefix.length + suffix.length + 1
            : prefix.length;
        const preStart = {
          line: curserStart.line - command.line,
          ch: curserStart.ch - prefix.length,
        };
        const pre = editor.getRange(preStart, curserStart);

        const sufEnd = {
          line: curserStart.line + command.line,
          ch: curserEnd.ch + suffix.length,
        };

        const suf = editor.getRange(curserEnd, sufEnd);

        const preLast = pre.slice(-1);
        const prefixLast = prefix.trimStart().slice(-1);
        const sufFirst = suf[0];

        if (suf === suffix.trimEnd()) {
          if (preLast === prefixLast && selectedText) {
            editor.replaceRange(selectedText, preStart, sufEnd);
            const changeCursor = (mode: number) => {
              editor.setCursor(
                curserStart.line + command.line * mode,
                curserEnd.ch + (cursorPos * mode + 8)
              );
            };
            return changeCursor(-1);
          }
        }

        editor.replaceSelection(`${prefix}${selectedText}${suffix}`);

        if (this.settings.useTogglingBehavior) {
          const newFrom = {
            line: curserStart.line + command.line,
            ch: curserStart.ch,
          };
          const newTo = {
            line: curserStart.line + command.line,
            ch:
              curserStart.ch +
              prefix.length +
              selectedText.length +
              suffix.length,
          };
          editor.setSelection(newFrom, newTo);
        } 

        return setCursor(1);
      };

      type CommandPlot = {
        char: number;
        line: number;
        prefix: string;
        suffix: string;
      };

      type commandsPlot = {
        [key: string]: CommandPlot;
      };

      const commandsMap: commandsPlot = {
        highlight: {
          char: 34,
          line: 0,
          prefix:
            this.settings.highlighterMethods === "css-classes"
              ? `<mark class="hltr-${highlighterKey.toLowerCase()}">`
              : `<mark style="background: ${this.settings.highlighters[highlighterKey]};">`,
          suffix: "</mark>",
        },
      };

      Object.keys(commandsMap).forEach((type) => {
        let highlighterpen = `highlightr-pen-${highlighterKey}`.toLowerCase();
        this.addCommand({
          id: highlighterKey,
          name: highlighterKey,
          icon: highlighterpen,
          editorCallback: async (editor: Editor) => {
            applyCommand(commandsMap[type], editor);
            await wait(10);
            editor.focus();
          },
        });
      });

      this.addCommand({
        id: "unhighlight",
        name: "Remove highlight",
        icon: "highlightr-eraser",
        editorCallback: async (editor: Editor) => {
          this.eraseHighlight(editor);
          editor.focus();
        },
      });
    });
  }

  refresh = () => {
    this.updateStyle();
  };

  updateStyle = () => {
    document.body.classList.toggle(
      "highlightr-lowlight",
      this.settings.highlighterStyle === "lowlight"
    );
    document.body.classList.toggle(
      "highlightr-floating",
      this.settings.highlighterStyle === "floating"
    );
    document.body.classList.toggle(
      "highlightr-rounded",
      this.settings.highlighterStyle === "rounded"
    );
    document.body.classList.toggle(
      "highlightr-realistic",
      this.settings.highlighterStyle === "realistic"
    );
  };

  onunload() {
    console.log("Highlightr unloaded");
  }

  handleHighlighterInContextMenu = (
    menu: Menu,
    editor: EnhancedEditor
  ): void => {
    contextMenu(this.app, menu, editor, this, this.settings);
  };

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
