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
				if (xhr.status >= 200 && xhr.status < 300) return done(null, xhr.responseText);
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
				node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
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
		if (trimmed === "<br>" || trimmed === "<div><br></div>" || trimmed === "<p><br></p>") return "";
		return html;
	}

	function EXEditor(textarea, options) {
		if (!isTextarea(textarea)) throw new Error("EXEditor: target must be a textarea");

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
		var toolbar = el("div", { class: "exeditor__toolbar", role: "toolbar" });
		var self = this;

		var buttons = [
			{ cmd: "bold", icon: "b.svg", label: "Bold", title: "Bold" },
			{ cmd: "italic", icon: "i.svg", label: "Italic", title: "Italic" },
			{ cmd: "underline", icon: "u.svg", label: "Underline", title: "Underline" },
			{ cmd: "insertUnorderedList", icon: "bullet.svg", label: "Bulleted list", title: "Bulleted list" },
			{ cmd: "insertOrderedList", icon: "list.svg", label: "Numbered list", title: "Numbered list" },
			{ cmd: "formatBlock", value: "blockquote", icon: "d_quote.svg", label: "Blockquote", title: "Blockquote" },
			{ cmd: "removeFormat", icon: "erase.svg", label: "Remove formatting", title: "Remove formatting" },
		];

		buttons.forEach(function (b) {
			var btn = el("button", {
				type: "button",
				class: "exeditor__btn",
				title: b.title,
				"aria-label": b.label,
				dataset: {
					cmd: b.cmd,
					value: b.value || "",
				},
			});
			self._setButtonIcon(btn, b.icon, b.label);
			toolbar.appendChild(btn);
		});

		// Link group
		var linkBtn = el("button", {
			type: "button",
			class: "exeditor__btn",
			title: "Insert/Edit link",
			"aria-label": "Insert/Edit link",
			dataset: { cmd: "createLink" },
		});
		this._setButtonIcon(linkBtn, "link.svg", "Link");
		toolbar.appendChild(linkBtn);

		var unlinkBtn = el("button", {
			type: "button",
			class: "exeditor__btn",
			title: "Remove link",
			"aria-label": "Remove link",
			dataset: { cmd: "unlink" },
		});
		this._setButtonIcon(unlinkBtn, "unlink.svg", "Unlink");
		toolbar.appendChild(unlinkBtn);

		return toolbar;
	};

	EXEditor.prototype._getIconBaseUrl = function () {
		var base = (this.options && this.options.iconBaseUrl) || EXEditor.iconBaseUrl || EXEditor._defaultIconBaseUrl;
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
		this._handlers.push({ node: node, event: event, handler: handler, opts: opts });
	};

	EXEditor.prototype._wire = function () {
		var self = this;

		// Toolbar clicks
		this._on(this.toolbar, "click", function (e) {
			var btn = e.target && e.target.closest ? e.target.closest("button[data-cmd]") : null;
			if (!btn) return;
			e.preventDefault();

			self.editor.focus();

			var cmd = btn.dataset.cmd;
			var value = btn.dataset.value || null;

			if (cmd === "createLink") {
				var url = window.prompt("Enter URL (https://...)");
				if (!url) return;
				try {
					// Basic normalization: add https:// if user provided domain.
					if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) url = "https://" + url;
				} catch (err) {}
				document.execCommand("createLink", false, url);
				self._postProcessAnchors();
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
		if (typeof this.options.onChange === "function") this.options.onChange(html);
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
		if (this.wrapper && this.wrapper.parentNode) this.wrapper.parentNode.removeChild(this.wrapper);

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
		for (var i = 0; i < nodes.length; i++) instances.push(new EXEditor(nodes[i], options));
		return instances;
	};

	// Expose
	EXEditor._defaultIconBaseUrl = joinUrl(detectScriptDirUrl(), "svg/");
	global.EXEditor = EXEditor;
})(typeof window !== "undefined" ? window : this);
