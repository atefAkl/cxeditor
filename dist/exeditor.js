/* EXEditor - lightweight WYSIWYG editor for textarea
   - Standalone: include JS/CSS and call EXEditor.attach(textarea)
   - Stores value as HTML inside original textarea
*/

(function (global) {
  "use strict";

  function detectScriptDirUrl() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i] && scripts[i].src ? String(scripts[i].src) : "";
        if (!src) continue;
        // Match .../exeditor.js (optionally with query string)
        if (/\/exeditor\.js(\?.*)?$/i.test(src)) {
          return src.replace(/\/[^/?#]+(\?.*)?$/, "/");
        }
      }
    } catch (e) {}
    return "";
  }

  function joinUrl(base, path) {
    if (!base) return path;
    try {
      return new URL(path, base).toString();
    } catch (e) {
      if (base.charAt(base.length - 1) !== "/") base += "/";
      return base + path;
    }
  }

  function fetchText(url, done) {
    if (!url) return done(new Error("Missing URL"));
    if (global.fetch) {
      global
        .fetch(url, { credentials: "same-origin" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (text) {
          done(null, text);
        })
        .catch(function (err) {
          done(err);
        });
      return;
    }

    // XHR fallback
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300)
          return done(null, xhr.responseText);
        done(new Error("HTTP " + xhr.status));
      };
      xhr.send(null);
    } catch (e) {
      done(e);
    }
  }

  function normalizeSvg(svgText) {
    // Intentionally minimal: keep SVG exactly as authored.
    return String(svgText || "");
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "dataset") {
          Object.keys(attrs.dataset).forEach(function (dk) {
            node.dataset[dk] = attrs.dataset[dk];
          });
        } else node.setAttribute(k, attrs[k]);
      });
    }
    if (children && children.length) {
      children.forEach(function (c) {
        if (c == null) return;
        node.appendChild(
          typeof c === "string" ? document.createTextNode(c) : c
        );
      });
    }
    return node;
  }

  function isTextarea(node) {
    return node && node.tagName && node.tagName.toLowerCase() === "textarea";
  }

  function clampEmptyHtml(html) {
    // Normalize common empty states from contenteditable.
    if (!html) return "";
    var trimmed = String(html).trim();
    if (
      trimmed === "<br>" ||
      trimmed === "<div><br></div>" ||
      trimmed === "<p><br></p>"
    )
      return "";
    return html;
  }

  function EXEditor(textarea, options) {
    if (!isTextarea(textarea))
      throw new Error("EXEditor: target must be a textarea");

    this.textarea = textarea;
    this.options = options || {};
    this._destroyed = false;
    this._handlers = [];

    this._init();
  }

  EXEditor.prototype._init = function () {
    var textarea = this.textarea;

    // Wrapper
    var wrapper = el("div", { class: "exeditor" });
    var toolbar = this._buildToolbar();
    var editor = el("div", {
      class: "exeditor__editor",
      contenteditable: "true",
      role: "textbox",
      "aria-multiline": "true",
      spellcheck: textarea.spellcheck ? "true" : "false",
    });

    // Initial content comes from textarea value (HTML)
    editor.innerHTML = textarea.value || "";

    // Hide textarea but keep it in the form
    textarea.style.display = "none";

    // Insert wrapper after textarea
    textarea.parentNode.insertBefore(wrapper, textarea.nextSibling);
    wrapper.appendChild(toolbar);
    wrapper.appendChild(editor);

    this.wrapper = wrapper;
    this.toolbar = toolbar;
    this.editor = editor;

    this._wire();
    this.syncToTextarea();
  };

  EXEditor.prototype._buildToolbar = function () {
    var toolbar = el("div", {
      class: "exeditor__toolbar btn-toolbar",
      role: "toolbar",
    });
    var self = this;

    // Undo/Redo group
    var undoRedoGroup = el("div", { class: "btn-group me-2", role: "group" });
    var undoBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-outline-secondary exeditor__btn",
      title: "Undo (Ctrl+Z)",
      "aria-label": "Undo",
      dataset: { cmd: "undo" },
    });
    this._setButtonIcon(undoBtn, "undo.svg", "Undo");
    undoRedoGroup.appendChild(undoBtn);

    var redoBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-outline-secondary exeditor__btn",
      title: "Redo (Ctrl+Y)",
      "aria-label": "Redo",
      dataset: { cmd: "redo" },
    });
    this._setButtonIcon(redoBtn, "redo.svg", "Redo");
    undoRedoGroup.appendChild(redoBtn);
    toolbar.appendChild(undoRedoGroup);

    // Separator
    toolbar.appendChild(el("div", { class: "exeditor__separator" }));

    // Headings dropdown
    var headingGroup = el("div", {
      class: "btn-group me-2 dropdown",
      role: "group",
    });
    var headingBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-outline-secondary exeditor__btn dropdown-toggle",
      title: "Heading",
      "aria-label": "Heading",
      "data-bs-toggle": "dropdown",
      "aria-expanded": "false",
    });
    this._setButtonIcon(headingBtn, "heading.svg", "Heading");
    headingGroup.appendChild(headingBtn);

    var headingMenu = el("ul", { class: "dropdown-menu" });
    var headingOptions = [
      { value: "p", label: "Normal" },
      { value: "h1", label: "Heading 1" },
      { value: "h2", label: "Heading 2" },
      { value: "h3", label: "Heading 3" },
      { value: "h4", label: "Heading 4" },
      { value: "h5", label: "Heading 5" },
      { value: "h6", label: "Heading 6" },
    ];
    headingOptions.forEach(function (opt) {
      var item = el("li", {});
      var link = el("a", {
        class: "dropdown-item",
        href: "#",
        text: opt.label,
        dataset: { cmd: "formatBlock", value: opt.value },
      });
      item.appendChild(link);
      headingMenu.appendChild(item);
    });
    headingGroup.appendChild(headingMenu);
    toolbar.appendChild(headingGroup);

    // Separator
    toolbar.appendChild(el("div", { class: "exeditor__separator" }));

    // Format buttons group
    var formatGroup = el("div", { class: "btn-group me-2", role: "group" });
    var formatButtons = [
      { cmd: "bold", icon: "b.svg", label: "Bold", title: "Bold (Ctrl+B)" },
      {
        cmd: "italic",
        icon: "i.svg",
        label: "Italic",
        title: "Italic (Ctrl+I)",
      },
      {
        cmd: "underline",
        icon: "u.svg",
        label: "Underline",
        title: "Underline (Ctrl+U)",
      },
    ];
    formatButtons.forEach(function (b) {
      var btn = el("button", {
        type: "button",
        class: "btn btn-sm btn-outline-secondary exeditor__btn",
        title: b.title,
        "aria-label": b.label,
        dataset: { cmd: b.cmd },
      });
      self._setButtonIcon(btn, b.icon, b.label);
      formatGroup.appendChild(btn);
    });
    toolbar.appendChild(formatGroup);

    // Separator
    toolbar.appendChild(el("div", { class: "exeditor__separator" }));

    // Alignment group
    var alignGroup = el("div", { class: "btn-group me-2", role: "group" });
    var alignButtons = [
      {
        cmd: "justifyLeft",
        icon: "align-left.svg",
        label: "Align Left",
        title: "Align Left",
      },
      {
        cmd: "justifyCenter",
        icon: "align-center.svg",
        label: "Align Center",
        title: "Align Center",
      },
      {
        cmd: "justifyRight",
        icon: "align-right.svg",
        label: "Align Right",
        title: "Align Right",
      },
      {
        cmd: "justifyFull",
        icon: "align-justify.svg",
        label: "Justify",
        title: "Justify",
      },
    ];
    alignButtons.forEach(function (b) {
      var btn = el("button", {
        type: "button",
        class: "btn btn-sm btn-outline-secondary exeditor__btn",
        title: b.title,
        "aria-label": b.label,
        dataset: { cmd: b.cmd },
      });
      self._setButtonIcon(btn, b.icon, b.label);
      alignGroup.appendChild(btn);
    });
    toolbar.appendChild(alignGroup);

    // Separator
    toolbar.appendChild(el("div", { class: "exeditor__separator" }));

    // Lists group
    var listGroup = el("div", { class: "btn-group me-2", role: "group" });
    var listButtons = [
      {
        cmd: "insertUnorderedList",
        icon: "bullet.svg",
        label: "Bulleted list",
        title: "Bulleted list",
      },
      {
        cmd: "insertOrderedList",
        icon: "list.svg",
        label: "Numbered list",
        title: "Numbered list",
      },
    ];
    listButtons.forEach(function (b) {
      var btn = el("button", {
        type: "button",
        class: "btn btn-sm btn-outline-secondary exeditor__btn",
        title: b.title,
        "aria-label": b.label,
        dataset: { cmd: b.cmd },
      });
      self._setButtonIcon(btn, b.icon, b.label);
      listGroup.appendChild(btn);
    });
    toolbar.appendChild(listGroup);

    // Separator
    toolbar.appendChild(el("div", { class: "exeditor__separator" }));

    // Insert group
    var insertGroup = el("div", { class: "btn-group me-2", role: "group" });
    var insertButtons = [
      {
        cmd: "insertImage",
        icon: "image.svg",
        label: "Insert Image",
        title: "Insert Image",
      },
      {
        cmd: "insertTable",
        icon: "table.svg",
        label: "Insert Table",
        title: "Insert Table",
      },
      {
        cmd: "insertCode",
        icon: "code.svg",
        label: "Insert Code",
        title: "Insert Code Block",
      },
    ];
    insertButtons.forEach(function (b) {
      var btn = el("button", {
        type: "button",
        class: "btn btn-sm btn-outline-secondary exeditor__btn",
        title: b.title,
        "aria-label": b.label,
        dataset: { cmd: b.cmd },
      });
      self._setButtonIcon(btn, b.icon, b.label);
      insertGroup.appendChild(btn);
    });
    toolbar.appendChild(insertGroup);

    // Link group
    var linkGroup = el("div", { class: "btn-group me-2", role: "group" });
    var linkBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-outline-secondary exeditor__btn",
      title: "Insert/Edit link",
      "aria-label": "Insert/Edit link",
      dataset: { cmd: "createLink" },
    });
    this._setButtonIcon(linkBtn, "link.svg", "Link");
    linkGroup.appendChild(linkBtn);

    var unlinkBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-outline-secondary exeditor__btn",
      title: "Remove link",
      "aria-label": "Remove link",
      dataset: { cmd: "unlink" },
    });
    this._setButtonIcon(unlinkBtn, "unlink.svg", "Unlink");
    linkGroup.appendChild(unlinkBtn);
    toolbar.appendChild(linkGroup);

    // Separator
    toolbar.appendChild(el("div", { class: "exeditor__separator" }));

    // Other buttons
    var otherGroup = el("div", { class: "btn-group me-2", role: "group" });
    var blockquoteBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-outline-secondary exeditor__btn",
      title: "Blockquote",
      "aria-label": "Blockquote",
      dataset: { cmd: "formatBlock", value: "blockquote" },
    });
    this._setButtonIcon(blockquoteBtn, "d_quote.svg", "Blockquote");
    otherGroup.appendChild(blockquoteBtn);

    var removeFormatBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-outline-secondary exeditor__btn",
      title: "Remove formatting",
      "aria-label": "Remove formatting",
      dataset: { cmd: "removeFormat" },
    });
    this._setButtonIcon(removeFormatBtn, "erase.svg", "Remove formatting");
    otherGroup.appendChild(removeFormatBtn);
    toolbar.appendChild(otherGroup);

    return toolbar;
  };

  EXEditor.prototype._getIconBaseUrl = function () {
    var base =
      (this.options && this.options.iconBaseUrl) ||
      EXEditor.iconBaseUrl ||
      EXEditor._defaultIconBaseUrl;
    if (!base) return "";
    base = String(base);
    if (base.charAt(base.length - 1) !== "/") base += "/";
    return base;
  };

  EXEditor.prototype._setButtonIcon = function (btn, iconFile, fallbackLabel) {
    var base = this._getIconBaseUrl();
    var url = joinUrl(base, iconFile);
    btn.innerHTML = "";
    var holder = el("span", { class: "exeditor__icon", "aria-hidden": "true" });
    btn.appendChild(holder);

    // Cache icons across instances
    EXEditor._iconCache = EXEditor._iconCache || {};
    if (EXEditor._iconCache[url]) {
      holder.innerHTML = EXEditor._iconCache[url];
      return;
    }

    fetchText(url, function (err, svgText) {
      if (err) {
        // Fallback to text so the button isn't blank.
        btn.textContent = fallbackLabel || "";
        return;
      }
      var normalized = normalizeSvg(svgText);
      EXEditor._iconCache[url] = normalized;
      holder.innerHTML = normalized;
    });
  };

  EXEditor.prototype._on = function (node, event, handler, opts) {
    node.addEventListener(event, handler, opts);
    this._handlers.push({
      node: node,
      event: event,
      handler: handler,
      opts: opts,
    });
  };

  EXEditor.prototype._wire = function () {
    var self = this;

    // Toolbar clicks
    this._on(this.toolbar, "click", function (e) {
      // Handle dropdown menu clicks first
      var dropdownLink =
        e.target && e.target.closest
          ? e.target.closest("a.dropdown-item[data-cmd]")
          : null;
      if (dropdownLink) {
        e.preventDefault();
        self.editor.focus();
        var cmd = dropdownLink.dataset.cmd;
        var value = dropdownLink.dataset.value || null;
        if (cmd === "formatBlock") {
          document.execCommand("formatBlock", false, value);
          self.syncToTextarea();
        }
        // Close dropdown
        var dropdown = dropdownLink.closest(".dropdown");
        if (dropdown) {
          var toggle = dropdown.querySelector(".dropdown-toggle");
          if (toggle && global.bootstrap && global.bootstrap.Dropdown) {
            var bsDropdown = global.bootstrap.Dropdown.getInstance(toggle);
            if (bsDropdown) {
              bsDropdown.hide();
            } else {
              bsDropdown = new global.bootstrap.Dropdown(toggle);
              bsDropdown.hide();
            }
          }
        }
        return;
      }

      var btn =
        e.target && e.target.closest
          ? e.target.closest("button[data-cmd]")
          : null;
      if (!btn) return;
      e.preventDefault();

      self.editor.focus();

      var cmd = btn.dataset.cmd;
      var value = btn.dataset.value || null;

      if (cmd === "createLink") {
        self._showLinkModal(function (linkData) {
          var selection = window.getSelection();
          var url = linkData.url;
          var text = linkData.text;
          var target = linkData.target;

          if (linkData.existingLink) {
            // Update existing link
            var link = linkData.existingLink;
            link.setAttribute("href", url);
            if (target) {
              link.setAttribute("target", target);
              link.setAttribute("rel", "noopener noreferrer");
            } else {
              link.removeAttribute("target");
              link.removeAttribute("rel");
            }
            if (text && text !== link.textContent) {
              link.textContent = text;
            }
          } else {
            // Create new link
            if (selection.rangeCount > 0 && !selection.isCollapsed) {
              // If text is selected, create link with selected text
              var range = selection.getRangeAt(0);
              var link = document.createElement("a");
              link.href = url;
              link.textContent = text || selection.toString();
              if (target) {
                link.setAttribute("target", target);
                link.setAttribute("rel", "noopener noreferrer");
              }
              range.deleteContents();
              range.insertNode(link);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            } else {
              // Insert link at cursor
              var link = document.createElement("a");
              link.href = url;
              link.textContent = text || url;
              if (target) {
                link.setAttribute("target", target);
                link.setAttribute("rel", "noopener noreferrer");
              }
              if (selection.rangeCount > 0) {
                var range = selection.getRangeAt(0);
                range.insertNode(link);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
              } else {
                self.editor.appendChild(link);
              }
            }
          }
          self._postProcessAnchors();
          self.syncToTextarea();
        });
        return;
      }

      if (cmd === "insertImage") {
        var imgUrl = window.prompt("Enter image URL:");
        if (!imgUrl) return;
        try {
          if (!/^https?:\/\//i.test(imgUrl)) imgUrl = "https://" + imgUrl;
        } catch (err) {}
        self._insertImage(imgUrl);
        return;
      }

      if (cmd === "insertTable") {
        var rows = parseInt(window.prompt("Number of rows:", "3"), 10) || 3;
        var cols = parseInt(window.prompt("Number of columns:", "3"), 10) || 3;
        if (rows > 0 && cols > 0) {
          self._insertTable(rows, cols);
        }
        return;
      }

      if (cmd === "insertCode") {
        self._insertCodeBlock();
        return;
      }

      if (cmd === "undo" || cmd === "redo") {
        document.execCommand(cmd, false, null);
        self.syncToTextarea();
        return;
      }

      if (cmd === "formatBlock") {
        document.execCommand("formatBlock", false, value);
        self.syncToTextarea();
        return;
      }

      // Common commands
      document.execCommand(cmd, false, value);
      self.syncToTextarea();
    });

    // Sync on typing/paste
    var schedule = (function () {
      var t = 0;
      return function () {
        if (t) window.clearTimeout(t);
        t = window.setTimeout(function () {
          t = 0;
          self._sanitizeAfterInput();
          self.syncToTextarea();
        }, 0);
      };
    })();

    this._on(this.editor, "input", schedule);
    this._on(this.editor, "blur", function () {
      self._sanitizeAfterInput();
      self.syncToTextarea();
    });

    // Clean paste (optional): keep HTML but strip MS Word noise a bit.
    this._on(this.editor, "paste", function () {
      // Let browser paste first, then clean.
      schedule();
    });

    // When form submits, ensure textarea is up to date.
    var form = this.textarea.form;
    if (form) {
      this._on(form, "submit", function () {
        self._sanitizeAfterInput();
        self.syncToTextarea();
      });
    }

    // Keyboard shortcuts
    this._on(this.editor, "keydown", function (e) {
      // Ctrl/Cmd + B (Bold)
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        document.execCommand("bold", false, null);
        self.syncToTextarea();
        return;
      }
      // Ctrl/Cmd + I (Italic)
      if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        document.execCommand("italic", false, null);
        self.syncToTextarea();
        return;
      }
      // Ctrl/Cmd + U (Underline)
      if ((e.ctrlKey || e.metaKey) && e.key === "u") {
        e.preventDefault();
        document.execCommand("underline", false, null);
        self.syncToTextarea();
        return;
      }
      // Ctrl/Cmd + Z (Undo)
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        document.execCommand("undo", false, null);
        self.syncToTextarea();
        return;
      }
      // Ctrl/Cmd + Y or Shift+Z (Redo)
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        document.execCommand("redo", false, null);
        self.syncToTextarea();
        return;
      }
    });
  };

  EXEditor.prototype._insertImage = function (url) {
    var img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.alt = "";

    var selection = window.getSelection();
    if (selection.rangeCount > 0) {
      var range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      this.editor.appendChild(img);
    }
    this.syncToTextarea();
  };

  EXEditor.prototype._insertTable = function (rows, cols) {
    var table = document.createElement("table");
    table.className = "table table-bordered";
    table.style.width = "100%";
    table.style.margin = "10px 0";

    for (var r = 0; r < rows; r++) {
      var tr = document.createElement("tr");
      for (var c = 0; c < cols; c++) {
        var td = document.createElement("td");
        td.innerHTML = "&nbsp;";
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }

    var selection = window.getSelection();
    if (selection.rangeCount > 0) {
      var range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(table);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      this.editor.appendChild(table);
    }
    this.syncToTextarea();
  };

  EXEditor.prototype._insertCodeBlock = function () {
    var pre = document.createElement("pre");
    var code = document.createElement("code");
    code.textContent = "// Enter your code here";
    pre.appendChild(code);
    pre.style.background = "#f5f5f5";
    pre.style.padding = "10px";
    pre.style.border = "1px solid #ddd";
    pre.style.borderRadius = "4px";
    pre.style.overflow = "auto";

    var selection = window.getSelection();
    if (selection.rangeCount > 0) {
      var range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(pre);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      this.editor.appendChild(pre);
    }
    this.syncToTextarea();
  };

  EXEditor.prototype._showLinkModal = function (callback) {
    var self = this;
    var selection = window.getSelection();
    var selectedText = "";
    var existingLink = null;

    // Get selected text or existing link
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      selectedText = selection.toString();
    } else {
      // Check if cursor is inside a link
      var node = selection.anchorNode;
      while (node && node !== self.editor) {
        if (node.nodeName === "A") {
          existingLink = node;
          selectedText = node.textContent || "";
          break;
        }
        node = node.parentNode;
      }
    }

    // Create modal
    var modalId = "exeditor-link-modal-" + Date.now();
    var modal = el("div", {
      class: "modal fade exeditor-link-modal",
      id: modalId,
      tabindex: "-1",
      "aria-labelledby": modalId + "-label",
      "aria-hidden": "true",
    });

    var modalDialog = el("div", { class: "modal-dialog" });
    var modalContent = el("div", { class: "modal-content" });

    // Modal header
    var modalHeader = el("div", { class: "modal-header" });
    var modalTitle = el("h5", {
      class: "modal-title",
      id: modalId + "-label",
      text: existingLink ? "تعديل الرابط" : "إضافة رابط",
    });
    var closeBtn = el("button", {
      type: "button",
      class: "btn-close",
      "data-bs-dismiss": "modal",
      "aria-label": "Close",
    });
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeBtn);

    // Modal body
    var modalBody = el("div", { class: "modal-body" });

    // Link text field
    var textGroup = el("div", { class: "mb-1" });
    var textLabel = el("label", {
      for: modalId + "-text",
      class: "form-label",
      text: "نص الرابط",
    });
    var textInput = el("input", {
      type: "text",
      class: "form-control",
      id: modalId + "-text",
      value: selectedText,
      placeholder: "أدخل نص الرابط",
    });
    textGroup.appendChild(textLabel);
    textGroup.appendChild(textInput);

    // URL field
    var urlGroup = el("div", { class: "mb-3" });
    var urlLabel = el("label", {
      for: modalId + "-url",
      class: "form-label",
      text: "رابط URL",
    });
    var urlInput = el("input", {
      type: "url",
      class: "form-control",
      id: modalId + "-url",
      value: existingLink ? existingLink.getAttribute("href") || "" : "",
      placeholder: "https://example.com",
      required: "required",
    });
    urlGroup.appendChild(urlLabel);
    urlGroup.appendChild(urlInput);

    // Open in new tab checkbox
    var checkboxGroup = el("div", { class: "mb-1 form-check" });
    var checkbox = el("input", {
      type: "checkbox",
      class: "form-check-input",
      id: modalId + "-target",
      checked: existingLink
        ? existingLink.getAttribute("target") === "_blank"
        : self.options && self.options.linkTargetBlank,
    });
    var checkboxLabel = el("label", {
      for: modalId + "-target",
      class: "form-check-label",
      text: "فتح في صفحة جديدة",
    });
    checkboxGroup.appendChild(checkbox);
    checkboxGroup.appendChild(checkboxLabel);

    modalBody.appendChild(textGroup);
    modalBody.appendChild(urlGroup);
    modalBody.appendChild(checkboxGroup);

    // Modal footer
    var modalFooter = el("div", { class: "modal-footer" });
    var cancelBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-secondary py-1",
      "data-bs-dismiss": "modal",
      text: "إلغاء",
    });
    var saveBtn = el("button", {
      type: "button",
      class: "btn btn-sm btn-primary py-1",
      text: existingLink ? "تحديث" : "إضافة",
    });

    modalFooter.appendChild(cancelBtn);
    modalFooter.appendChild(saveBtn);

    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modalDialog.appendChild(modalContent);
    modal.appendChild(modalDialog);

    // Add modal to body
    document.body.appendChild(modal);

    // Initialize Bootstrap modal
    var bsModal = null;
    if (global.bootstrap && global.bootstrap.Modal) {
      bsModal = new global.bootstrap.Modal(modal, {
        backdrop: true,
        keyboard: true,
      });

      // Handle save button
      saveBtn.addEventListener("click", function () {
        var url = urlInput.value.trim();
        var text = textInput.value.trim();
        var openNewTab = checkbox.checked;

        if (!url) {
          urlInput.focus();
          return;
        }

        // Normalize URL
        try {
          if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
            url = "https://" + url;
          }
        } catch (err) {}

        // Call callback with link data
        if (typeof callback === "function") {
          callback({
            url: url,
            text: text || url,
            target: openNewTab ? "_blank" : null,
            existingLink: existingLink,
          });
        }

        // Hide and remove modal
        if (bsModal) {
          bsModal.hide();
        }
        setTimeout(function () {
          if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
          }
        }, 300);
      });

      // Handle Enter key in URL field
      urlInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          saveBtn.click();
        }
      });

      // Show modal
      bsModal.show();
    } else {
      // Fallback if Bootstrap is not available
      alert("Bootstrap is required for the link modal");
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }
  };

  EXEditor.prototype._sanitizeAfterInput = function () {
    // Minimal internal cleanup (not a full security sanitizer).
    // Consumers should sanitize server-side before rendering untrusted HTML.
    this._postProcessAnchors();
    this._stripEmptySpans();
  };

  EXEditor.prototype._postProcessAnchors = function () {
    var anchors = this.editor.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      // Safer defaults when opening links.
      if (this.options && this.options.linkTargetBlank) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }

      // Remove javascript: links
      var href = a.getAttribute("href") || "";
      if (/^\s*javascript:/i.test(href)) a.removeAttribute("href");
    }
  };

  EXEditor.prototype._stripEmptySpans = function () {
    var spans = this.editor.querySelectorAll("span");
    for (var i = spans.length - 1; i >= 0; i--) {
      var s = spans[i];
      if (!s.attributes.length && !s.style.cssText && s.textContent === "") {
        s.parentNode.removeChild(s);
      }
    }
  };

  EXEditor.prototype.syncToTextarea = function () {
    if (this._destroyed) return;
    var html = clampEmptyHtml(this.editor.innerHTML);
    this.textarea.value = html;
    if (typeof this.options.onChange === "function")
      this.options.onChange(html);
  };

  EXEditor.prototype.setHTML = function (html) {
    if (this._destroyed) return;
    this.editor.innerHTML = html || "";
    this.syncToTextarea();
  };

  EXEditor.prototype.getHTML = function () {
    return clampEmptyHtml(this.editor.innerHTML);
  };

  EXEditor.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;

    // Remove handlers
    for (var i = 0; i < this._handlers.length; i++) {
      var h = this._handlers[i];
      h.node.removeEventListener(h.event, h.handler, h.opts);
    }
    this._handlers = [];

    // Restore textarea
    this.textarea.style.display = "";
    this.textarea.value = this.getHTML();

    // Remove wrapper
    if (this.wrapper && this.wrapper.parentNode)
      this.wrapper.parentNode.removeChild(this.wrapper);

    this.wrapper = null;
    this.toolbar = null;
    this.editor = null;
  };

  EXEditor.attach = function (textarea, options) {
    return new EXEditor(textarea, options);
  };

  EXEditor.attachAll = function (selector, options) {
    var sel = selector || "textarea[data-exeditor]";
    var nodes = document.querySelectorAll(sel);
    var instances = [];
    for (var i = 0; i < nodes.length; i++)
      instances.push(new EXEditor(nodes[i], options));
    return instances;
  };

  // Expose
  EXEditor._defaultIconBaseUrl = joinUrl(detectScriptDirUrl(), "svg/");
  global.EXEditor = EXEditor;
})(typeof window !== "undefined" ? window : this);
