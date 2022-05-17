/*
 * Copyright (c) 2012 Peter Flynn.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, regexp: true, bitwise: true */
/*global define, brackets, $, window */

define(function (require, exports, module) {
    "use strict";

    // Brackets modules
    var EditorManager = brackets.getModule("editor/EditorManager"),
        InlineTextEditor = brackets.getModule("editor/InlineTextEditor").InlineTextEditor,
        CommandManager = brackets.getModule("command/CommandManager"),
        KeyBindingManager = brackets.getModule("command/KeyBindingManager");


    var isMac = (brackets.platform === "mac");

    var uniqueNum = 0;  // used to ensure unique undo batching per drag

    // Utilities
    function clip(val, max) {
        return (val < 0 ? 0 : (val > max ? max : val));
    }

    /** Finds a regex match whose bounds overlap or touch the given insertion point index */
    function findMatchNearPos(regex, string, goalI) {
        regex.lastIndex = 0;  // reset regexp object state
        var match;
        while ((match = regex.exec(string)) !== null) {
            if (match.index <= goalI && match.index + match[0].length >= goalI) {
                return match;
            }
        }
        return null;
    }


    // Scrubbing a single number
    function SimpleNumberScrub(match) {
        var origStringValue = match[0];
        this.origValue = parseFloat(origStringValue);

        // Increment slower for numbers with decimal (even if it's ".0")
        this.increment = (origStringValue.indexOf(".") === -1) ? 1 : 0.1;
    }

    SimpleNumberScrub.REGEX = /-?\d*\.?\d+/g;  // TODO: don't include '-' if preceded by another digit (e.g. "1-5")

    SimpleNumberScrub.prototype.update = function (delta) {
        var newVal = this.origValue + (delta * this.increment);
        if (this.increment < 1) {
            newVal = Math.round(newVal * 10) / 10;  // prevent rounding errors from adding extra decimals
        }

        var str = String(newVal);
        if (this.increment < 1 && str.indexOf(".") === -1) {
            str += ".0";    // don't jitter to a shorter length when passing a whole number
        }
        return str;
    };

    // Scrubbing 3-digit hex color
    function Color3Scrub(match) {
        var string = match[0];
        this.r = parseInt(string[1], 16);
        this.g = parseInt(string[2], 16);
        this.b = parseInt(string[3], 16);
    }

    Color3Scrub.REGEX = /#[0-9a-f]{3}/gi;  // TODO: don't match if followed by more hex alphanum chars

    Color3Scrub.prototype.update = function (delta) {
        var r = clip(this.r + delta, 15);
        var g = clip(this.g + delta, 15);
        var b = clip(this.b + delta, 15);
        return "#" + r.toString(16) + g.toString(16) + b.toString(16);
    };

    // Scrubbing 6-digit hex color
    function Color6Scrub(match) {
        var string = match[0];
        this.r = parseInt(string[1] + string[2], 16);
        this.g = parseInt(string[3] + string[4], 16);
        this.b = parseInt(string[5] + string[6], 16);
    }

    Color6Scrub.REGEX = /#[0-9a-f]{6}/gi;  // TODO: don't match if followed by more hex alphanum chars

    Color6Scrub.prototype.update = function (delta) {
        function force2Digits(str) {
            if (str.length === 1) {
                str = "0" + str;
            }
            return str;
        }

        var r = clip(this.r + delta, 255);
        var g = clip(this.g + delta, 255);
        var b = clip(this.b + delta, 255);
        return "#" + force2Digits(r.toString(16)) + force2Digits(g.toString(16)) + force2Digits(b.toString(16));
    };

    function parseForScrub(lineText, goalI) {
        function tryMode(ScrubMode) {
            var match = findMatchNearPos(ScrubMode.REGEX, lineText, goalI);
            if (match) {
                var state = new ScrubMode(match);

                // Ensures the entire drag (or consecutive nudges) is undone atomically
                state.origin = "*everyscrub" + (++uniqueNum);

                return {state: state, match: match};
            }
        }

        return (
            tryMode(Color6Scrub) ||
            tryMode(Color3Scrub) ||
            tryMode(SimpleNumberScrub)
        );
    }


    /** Main scrubbing event handling. Detects number format, adds global move/up listeners, detaches when done */
    function handleEditorMouseDown(editor, event) {
        // Drag state
        var scrubState; // instance of one of the *Scrub classes
        var downX;      // mousedown pageX
        var lastText;  // last value of scrubState.update()
        var lastRange;  // text range of lastText in the code

        function moveHandler(event) {
            var pxDelta = event.pageX - downX;
            // eslint-disable-next-line no-bitwise
            var valDelta = (pxDelta / 8) | 0;  // "| 0" truncates to int
            var newText = scrubState.update(valDelta);

            if (newText !== lastText) {
                lastText = newText;
                editor._codeMirror.replaceRange(newText, lastRange.start, lastRange.end, scrubState.origin);
                lastRange.end.ch = lastRange.start.ch + newText.length;
                editor.setSelection(lastRange.start, lastRange.end, undefined, undefined, scrubState.origin);
            }
        }

        // Note: coordsChar() returns the closest insertion point, not always char the click was ON; doesn't matter to us here though
        var pos = editor._codeMirror.coordsChar({left: event.pageX, top: event.pageY});
        var lineText = editor.document.getLine(pos.line);

        // Is this pos touching a value we can scrub? Init value-specific state if so
        var result = parseForScrub(lineText, pos.ch);
        if (result) {
            scrubState = result.state;
            event.stopPropagation();
            event.preventDefault();

            downX = event.pageX;
            $(window.document).on("mousemove.scrubbing", moveHandler);
            $(window.document).on("mouseup.scrubbing", function () {
                $(window.document).off(".scrubbing", moveHandler);
            });

            lastText = result.match[0];
            lastRange = {
                start: {line: pos.line, ch: result.match.index},
                end: {line: pos.line, ch: result.match.index + lastText.length}
            };

            editor.setSelection(lastRange.start, lastRange.end, undefined, undefined, scrubState.origin);
        }
    }


    /** Finds innermost editor containing the given element */
    function editorFromElement(element) {
        var result;
        var fullEditor = EditorManager.getCurrentFullEditor();
        if (fullEditor) {
            fullEditor.getInlineWidgets().forEach(function (widget) {
                if (widget.htmlContent.contains(element)) {
                    if (widget instanceof InlineTextEditor) {
                        if (widget.editor && widget.editor.getRootElement().contains(element)) {
                            result = widget.editor;
                        }
                    } else {
                        // Ignore mousedown on inline widgets other than editors (if left undefined, we'd return fullEditor below)
                        result = null;
                    }
                }
            });

            if (result !== undefined) {
                return result;
            } else {
                return fullEditor;
            }
        }
        return null;
    }

    function handleMouseDown(event) {
        // ctrl+Alt+drag on Win, cmd+Opt+drag on Mac
        if (event.which === 1 && ((!isMac && event.altKey && event.ctrlKey) || (isMac && event.altKey && event.metaKey)) ) {
            // Which editor did mousedown occur on (inline vs. full-size vs. no editor open)
            // (EditorManager.getActiveEditor()/getFocusedEditor() won't have updated yet, so can't just use that)
            var editor = editorFromElement(event.target);
            if (editor) {
                handleEditorMouseDown(editor, event);
            }
        }
    }


    /**
     * Remember state between consecutive nudges of the same value. Otherwise nudging colors wouldn't work well
     * because we lose information once one channel saturates.
     * @type {?{scrubState: Object, delta: number, lastText: string, line: number, ch: number, fullPath: string}}
     */
    var lastNudge = null;

    function nudge(dir) {
        var editor = EditorManager.getFocusedEditor();
        if (!editor) {
            return;
        }

        var pos = editor.getCursorPos();
        var lineText = editor.document.getLine(pos.line);

        // Is this pos touching a value we can scrub?
        var result = parseForScrub(lineText, pos.ch);
        var match = result && result.match;
        var scrubState;

        if (result) {
            // We're continuing the last nudge if it's in the same place and the text is how we left it
            if (lastNudge && editor.document.file.fullPath === lastNudge.fullPath &&
                pos.line === lastNudge.line && match.index === lastNudge.ch && match[0] === lastNudge.lastText) {
                lastNudge.delta += dir;
                scrubState = lastNudge.scrubState;  // (we ignore the newer result.state object)
            } else {
                // Otherwise, begin a new nudge sequence
                lastNudge = {
                    scrubState: result.state,
                    delta: dir,
                    lastText: match[0],
                    line: pos.line,
                    ch: match.index,
                    fullPath: editor.document.file.fullPath
                };
                scrubState = result.state;
            }

            // Replace old text value with new text value
            var newText = scrubState.update(lastNudge.delta);
            var lastRange = {
                start: {line: pos.line, ch: lastNudge.ch},
                end: {line: pos.line, ch: lastNudge.ch + lastNudge.lastText.length}
            };
            editor._codeMirror.replaceRange(newText, lastRange.start, lastRange.end, scrubState.origin);

            lastNudge.lastText = newText;
            lastRange.end.ch = lastRange.start.ch + newText.length;

            editor.setSelection(lastRange.start, lastRange.end, undefined, undefined, scrubState.origin);
        }
    }


    // Listen to all mousedowns in the editor area
    $("#editor-holder")[0].addEventListener("mousedown", handleMouseDown, true);

    // Keyboard shortcuts to "nudge" value up/down
    var CMD_NUDGE_UP = "pflynn.everyscrub.nudge_up",
        CMD_NUDGE_DN = "pflynn.everyscrub.nudge_down";
    CommandManager.register("Increment Number", CMD_NUDGE_UP, function () {
        nudge(+1);
    });
    CommandManager.register("Decrement Number", CMD_NUDGE_DN, function () {
        nudge(-1);
    });
    KeyBindingManager.addBinding(CMD_NUDGE_UP, "Ctrl-Alt-Up");
    KeyBindingManager.addBinding(CMD_NUDGE_DN, "Ctrl-Alt-Down");
});
